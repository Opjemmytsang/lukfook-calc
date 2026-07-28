'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const handlers = {};
const stored = new Map();
const cacheWrites = [];
const fetchCalls = [];

const cache = {
  addAll: async () => {},
  match: async (request) => stored.get(typeof request === 'string' ? request : request.url),
  put: async (request, response) => {
    const key = typeof request === 'string' ? request : request.url;
    cacheWrites.push(key);
    stored.set(key, response);
  }
};

const context = {
  URL,
  Promise,
  self: {
    location: { origin: 'https://example.test' },
    addEventListener: (name, handler) => { handlers[name] = handler; },
    skipWaiting: async () => {},
    clients: { claim: async () => {} }
  },
  caches: {
    open: async () => cache,
    match: cache.match,
    keys: async () => ['lukfook-smart-quote-demo-v2', 'lukfook-smart-quote-demo-v3'],
    delete: async () => true
  },
  fetch: async (request, options = {}) => {
    const url = typeof request === 'string' ? request : request.url;
    fetchCalls.push({ url, options });
    return {
      ok: true,
      type: 'basic',
      clone() { return this; }
    };
  }
};

vm.runInNewContext(fs.readFileSync('service-worker.js', 'utf8'), context, { filename: 'service-worker.js' });
assert.ok(handlers.fetch, 'fetch handler was not registered');

async function dispatch(url, mode = 'cors') {
  let responsePromise;
  handlers.fetch({
    request: { method: 'GET', url, mode },
    respondWith: (promise) => { responsePromise = Promise.resolve(promise); }
  });
  return responsePromise;
}

(async () => {
  await dispatch('https://lukfook-goldprice-proxy.arwing28.workers.dev');
  const apiCall = fetchCalls.find((call) => call.url.includes('goldprice-proxy'));
  assert.equal(apiCall.options.cache, 'no-store');
  assert.ok(!cacheWrites.some((url) => url.includes('goldprice-proxy')));

  await dispatch('https://example.test/assets/js/smart-quote.js');
  assert.ok(cacheWrites.includes('https://example.test/assets/js/smart-quote.js'));

  console.log('service worker tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
