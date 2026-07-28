'use strict';

const assert = require('node:assert/strict');
const { parseQrPayload, calculateQuotes, normalisePricePayload, createSummary, GRAMS_PER_TAEL } = require('../assets/js/smart-quote.js');

const parsed = parseQrPayload('ITEM001/MODEL9/10.5/STYLE/SUP/26-07-28/1200/EXTRA');
assert.deepEqual(
  { itemNo: parsed.itemNo, modelNo: parsed.modelNo, weight: parsed.weight, fee: parsed.fee },
  { itemNo: 'ITEM001', modelNo: 'MODEL9', weight: 10.5, fee: 1200 }
);
assert.equal(Object.hasOwn(parsed, 'hidden'), false);
assert.throws(() => parseQrPayload('A/B/1/C/D/E'), /資料不完整/);
assert.throws(() => parseQrPayload('A/B/abc/C/D/E/100'), /金重/);
assert.throws(() => parseQrPayload('A/B/1/C/D/E/abc'), /工費／標價/);
assert.throws(() => parseQrPayload(`A/B/1/C/D/E/1/${'X'.repeat(4096)}`), /資料不完整/);

const gramQuotes = calculateQuotes({ weightGram: 10, fee: 1000, sellPrice: 800, unit: 'gram' });
assert.deepEqual(gramQuotes.map(({ label }) => label), ['正價', '半工', '免工', '全單 95 折']);
assert.deepEqual(gramQuotes.map(({ amount }) => amount), [9000, 8500, 8000, 8550]);

const taelQuotes = calculateQuotes({ weightGram: GRAMS_PER_TAEL, fee: 1000, sellPrice: 30000, unit: 'tael' });
assert.deepEqual(taelQuotes.map(({ amount }) => Number(amount.toFixed(2))), [31000, 30500, 30000, 29450]);
assert.throws(() => calculateQuotes({ weightGram: '', fee: 0, sellPrice: 800, unit: 'gram' }), /金重/);

const payload = normalisePricePayload({ '克黃金售出': 800, '黃金售出': 29943.2, record_date: '2026-07-28 09:00:00' });
assert.equal(payload.gram, 800);
assert.equal(payload.tael, 29943.2);
assert.equal(payload.date, '2026-07-28 09:00:00');
assert.throws(() => normalisePricePayload({}), /不完整/);

const summary = createSummary({
  itemNo: 'ITEM001',
  modelNo: 'MODEL9',
  weight: 10,
  fee: 1000,
  sellPrice: 800,
  unit: 'gram',
  quotes: gramQuotes,
  styleCode: 'MUST_NOT_APPEAR',
  supplierCode: 'MUST_NOT_APPEAR',
  entryDate: 'MUST_NOT_APPEAR',
  rawQr: 'MUST_NOT_APPEAR'
});
assert.match(summary, /^六福珠寶智能報價 DEMO/);
assert.match(summary, /正價：HK\$ 9,000\.00/);
assert.match(summary, /以上數據只作參考，一切以金星系統數據為準。$/);
assert.ok(!summary.includes('MUST_NOT_APPEAR'));

console.log('smart-quote tests passed');
