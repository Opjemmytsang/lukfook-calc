const MAX_BODY = 5 * 1024 * 1024;
const MAX_PHOTO = 1536 * 1024;

async function readJSON(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing body');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) {
      await reader.cancel();
      throw new RangeError('Body too large');
    }
    text += decoder.decode(value, { stream: true });
  }
  return JSON.parse(text + decoder.decode());
}

function validMessage(data) {
  return data &&
    typeof data.id === 'string' && /^[a-f0-9-]{36}$/i.test(data.id) &&
    typeof data.subject === 'string' && data.subject.length > 0 && data.subject.length <= 160 &&
    !/[\r\n]/.test(data.subject) &&
    typeof data.text === 'string' && data.text.length > 0 && data.text.length <= 3000 &&
    Array.isArray(data.photos) && data.photos.length <= 3 &&
    data.photos.every((photo) => typeof photo === 'string' && photo.length <= MAX_PHOTO &&
      photo.length % 4 === 0 && /^\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(photo));
}

async function authorized(header, key) {
  if (!header?.startsWith('Bearer ') || header.length > 256) return false;
  const encoder = new TextEncoder();
  const [actual, expected] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(header.slice(7))),
    crypto.subtle.digest('SHA-256', encoder.encode(key))
  ]);
  const a = new Uint8Array(actual);
  const b = new Uint8Array(expected);
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  return difference === 0;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const headers = {
      'Cache-Control': 'no-store',
      'Vary': 'Origin'
    };
    const reply = (status, error) => Response.json(error ? { error } : { ok: true }, { status, headers });

    if (!origin || origin !== env.STORE_VISIT_ORIGIN) return reply(403, 'ORIGIN_NOT_ALLOWED');
    headers['Access-Control-Allow-Origin'] = origin;
    if (new URL(request.url).pathname !== '/send') return reply(404, 'NOT_FOUND');
    if (request.method === 'OPTIONS') {
      headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
      headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== 'POST') return reply(405, 'METHOD_NOT_ALLOWED');

    if (!env.STORE_VISIT_ACCESS_KEY || env.STORE_VISIT_ACCESS_KEY.length < 32 ||
        !env.STORE_VISIT_RECIPIENT || !env.STORE_VISIT_FROM || !env.RESEND_API_KEY) {
      return reply(503, 'MAIL_NOT_CONFIGURED');
    }
    if (!await authorized(request.headers.get('Authorization'), env.STORE_VISIT_ACCESS_KEY)) {
      return reply(401, 'ACCESS_DENIED');
    }
    if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') {
      return reply(415, 'INVALID_CONTENT_TYPE');
    }

    let data;
    try {
      data = await readJSON(request);
    } catch (error) {
      return error instanceof RangeError ? reply(413, 'MESSAGE_TOO_LARGE') : reply(400, 'INVALID_MESSAGE');
    }
    if (!validMessage(data)) return reply(400, 'INVALID_MESSAGE');

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `store-visit/${data.id}`
        },
        body: JSON.stringify({
          from: env.STORE_VISIT_FROM,
          to: [env.STORE_VISIT_RECIPIENT],
          subject: data.subject,
          text: data.text,
          attachments: data.photos.map((content, index) => ({ content, filename: `store-visit-${index + 1}.jpg` }))
        }),
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) return reply(502, 'MAIL_PROVIDER_ERROR');
      return reply(200);
    } catch {
      return reply(502, 'MAIL_PROVIDER_ERROR');
    }
  }
};
