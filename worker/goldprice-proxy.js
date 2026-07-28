const TARGET_URL =
  "https://www.lukfookeshop.com.hk/zh-hk/%E6%AF%8F%E6%97%A5%E9%87%91%E5%83%B9";

const ALLOW_ORIGIN = "*";

export default {
  async fetch(request) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": ALLOW_ORIGIN,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
      "Access-Control-Max-Age": "86400",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "GET") {
      return jsonResponse(
        {
          ok: false,
          error: "METHOD_NOT_ALLOWED",
          message: "只支援 GET 請求。",
        },
        405,
        corsHeaders,
      );
    }

    const requestUrl = new URL(request.url);

    if (requestUrl.pathname === "/health") {
      return jsonResponse(
        {
          ok: true,
          service: "lukfook-goldprice-proxy",
          target: TARGET_URL,
          at: new Date().toISOString(),
        },
        200,
        {
          ...corsHeaders,
          "Cache-Control": "no-store",
        },
      );
    }

    try {
      const upstream = await fetchWithTimeout(
        TARGET_URL,
        {
          method: "GET",
          headers: {
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-HK,zh-TW;q=0.9,en;q=0.8",
            "User-Agent":
              "Mozilla/5.0 (compatible; LukfookGoldPriceProxy/2.0)",
            "Cache-Control": "no-cache",
          },
          cf: {
            cacheEverything: true,
            cacheTtlByStatus: {
              "200-299": 60,
              "300-399": 0,
              "400-499": 0,
              "500-599": 0,
            },
          },
        },
        12000,
      );

      const html = await upstream.text();

      if (!upstream.ok) {
        return jsonResponse(
          {
            ok: false,
            error: "UPSTREAM_HTTP_ERROR",
            message: `上游金價網站回傳 HTTP ${upstream.status}。`,
            upstreamStatus: upstream.status,
            preview: sanitisePreview(html),
            target: TARGET_URL,
            at: new Date().toISOString(),
          },
          502,
          { ...corsHeaders, "Cache-Control": "no-store" },
        );
      }

      if (!html.trim()) {
        return jsonResponse(
          {
            ok: false,
            error: "EMPTY_UPSTREAM_RESPONSE",
            message: "上游金價網站沒有回傳內容。",
            target: TARGET_URL,
            at: new Date().toISOString(),
          },
          502,
          { ...corsHeaders, "Cache-Control": "no-store" },
        );
      }

      const pageText = htmlToText(html);
      const prices = extractGoldPrices(pageText);

      if (prices.gramSellPrice === null && prices.taelSellPrice === null) {
        return jsonResponse(
          {
            ok: false,
            error: "PRICE_NOT_FOUND",
            message:
              "無法從每日金價頁面找到 9999/999 金賣出價，網站版面可能已更改。",
            preview: sanitisePreview(pageText),
            target: TARGET_URL,
            at: new Date().toISOString(),
          },
          502,
          { ...corsHeaders, "Cache-Control": "no-store" },
        );
      }

      let gramSellPrice = prices.gramSellPrice;
      let taelSellPrice = prices.taelSellPrice;

      if (gramSellPrice === null && taelSellPrice !== null) {
        gramSellPrice = roundToOneDecimal(taelSellPrice / 37.429);
      }

      if (taelSellPrice === null && gramSellPrice !== null) {
        taelSellPrice = Math.round(gramSellPrice * 37.429);
      }

      const staleStatus = getStaleStatus(prices.recordDate);

      return jsonResponse(
        {
          ok: true,
          "黃金售出": taelSellPrice,
          "克黃金售出": gramSellPrice,
          gold_sell: taelSellPrice,
          gold_sell_gram: gramSellPrice,
          product: "9999/999金",
          currency: "HKD",
          unit_tael: "両",
          unit_gram: "克",
          record_date: prices.recordDate,
          proxy_fetched_at: new Date().toISOString(),
          proxy_source: TARGET_URL,
          proxy_is_stale: staleStatus.isStale,
          proxy_warning: staleStatus.warning,
        },
        200,
        {
          ...corsHeaders,
          "Cache-Control": "public, max-age=60, must-revalidate",
          "X-Gold-Price-Proxy": "lukfook-eshop",
          "X-Upstream-Status": String(upstream.status),
        },
      );
    } catch (error) {
      const isTimeout =
        error?.name === "AbortError" ||
        String(error?.message || "").toLowerCase().includes("timeout");

      return jsonResponse(
        {
          ok: false,
          error: isTimeout ? "UPSTREAM_TIMEOUT" : "UPSTREAM_FETCH_FAILED",
          message: isTimeout
            ? "讀取六福每日金價頁面逾時，請稍後再試。"
            : getErrorMessage(error),
          target: TARGET_URL,
          at: new Date().toISOString(),
        },
        502,
        { ...corsHeaders, "Cache-Control": "no-store" },
      );
    }
  },
};

function extractGoldPrices(text) {
  const normalisedText = String(text)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\r/g, "\n")
    .replace(/\n+/g, "\n");

  const summaryPattern =
    /9999\s*\/\s*999\s*金\s*賣出價[\s\S]{0,150}?HKD\s*([\d,]+(?:\.\d+)?)\s*\(\s*両\s*\)[\s\S]{0,80}?HKD\s*([\d,]+(?:\.\d+)?)\s*\(\s*克\s*\)/i;

  const summaryMatch = normalisedText.match(summaryPattern);
  let taelSellPrice = null;
  let gramSellPrice = null;

  if (summaryMatch) {
    taelSellPrice = parsePrice(summaryMatch[1]);
    gramSellPrice = parsePrice(summaryMatch[2]);
  }

  if (taelSellPrice === null || gramSellPrice === null) {
    const productStart = normalisedText.search(/9999\s*\/\s*999\s*金/i);

    if (productStart >= 0) {
      const productSection = normalisedText.slice(productStart, productStart + 800);
      const gramMatch = productSection.match(
        /\(\s*克\s*\)\s*HKD\s*([\d,]+(?:\.\d+)?)/i,
      );
      const taelMatch = productSection.match(
        /\(\s*両\s*\)\s*HKD\s*([\d,]+(?:\.\d+)?)/i,
      );

      if (gramSellPrice === null && gramMatch) {
        gramSellPrice = parsePrice(gramMatch[1]);
      }

      if (taelSellPrice === null && taelMatch) {
        taelSellPrice = parsePrice(taelMatch[1]);
      }
    }
  }

  const dateMatch = normalisedText.match(
    /更新時間\s*[:：]\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/,
  );

  return {
    gramSellPrice,
    taelSellPrice,
    recordDate: dateMatch ? dateMatch[1] : "",
  };
}

function htmlToText(html) {
  return String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/td>/gi, " ")
    .replace(/<\/th>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#47;/gi, "/")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function parsePrice(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 0 ? value : null;
  }

  if (typeof value !== "string") return null;

  const cleaned = value
    .replace(/HKD/gi, "")
    .replace(/HK\$/gi, "")
    .replace(/,/g, "")
    .replace(/\s+/g, "")
    .replace(/[^\d.-]/g, "");

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function getStaleStatus(recordDate) {
  if (!recordDate) {
    return {
      isStale: false,
      warning: "上游頁面未能提供金價更新時間。",
    };
  }

  const parsedDate = new Date(recordDate.replace(" ", "T") + "+08:00");

  if (Number.isNaN(parsedDate.getTime())) {
    return {
      isStale: false,
      warning: `無法識別上游更新時間：${recordDate}`,
    };
  }

  if (Date.now() - parsedDate.getTime() > 24 * 60 * 60 * 1000) {
    return {
      isStale: true,
      warning: `六福網店顯示的金價更新時間可能已過期：${recordDate}`,
    };
  }

  return { isStale: false, warning: "" };
}

function sanitisePreview(text) {
  return String(text).replace(/\s+/g, " ").slice(0, 400);
}

function roundToOneDecimal(value) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function getErrorMessage(error) {
  return error && typeof error.message === "string" ? error.message : String(error);
}
