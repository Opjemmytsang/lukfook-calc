'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const RegionConfig = require('../assets/js/region-config.js');
const OverseasQuote = require('../assets/js/overseas-quote.js');
const { parseQrPayload, calculateQuotes } = require('../assets/js/smart-quote.js');

const expectedRates = {
  US2: 0.08875, US4: 0.08875, US5: 0.08625, US6: 0.09375, US7: 0.105, US8: 0.08875,
  BC2: 0.12, CA5: 0.13, CA6: 0.13,
  AU2: 0.10, AU7: 0.10, AU3: 0.10, AU5: 0.10, AU6: 0.10, AU8: 0.10,
  MY1: 0, MY2: 0, MY4: 0, MY5: 0, MY7: 0,
  SP3: 0.09, SP4: 0.09,
  UK1: 0.20
};

assert.equal(RegionConfig.OVERSEAS_STORES.length, 23);
for (const [storeCode, rate] of Object.entries(expectedRates)) {
  assert.equal(RegionConfig.getStoreConfig(storeCode)?.totalTaxRate, rate, `${storeCode} tax rate is incorrect`);
}
assert.deepEqual(
  RegionConfig.getStoresByRegion('US').map(({ storeCode }) => storeCode),
  ['US2', 'US4', 'US5', 'US6', 'US7', 'US8']
);
assert.deepEqual(
  RegionConfig.getStoresByRegion('SG').map(({ storeCode }) => storeCode),
  ['SP3', 'SP4']
);

const bc2 = OverseasQuote.calculateOverseasQuotes({
  storeCode: 'BC2',
  weightGram: 1,
  sellPrice: 1000,
  adjustedFee: 0
});
assert.equal(bc2[0].preTaxAmount, 1000);
assert.equal(bc2[0].taxAmount, 120);
assert.equal(bc2[0].totalAmount, 1120);
assert.deepEqual(OverseasQuote.taxLines(RegionConfig.getStoreConfig('BC2')), [
  { name: 'GST', rate: 0.05 },
  { name: 'PST', rate: 0.07 },
  { name: '總稅率', rate: 0.12 }
]);

const sp3 = OverseasQuote.calculateOverseasQuotes({
  storeCode: 'SP3',
  weightGram: 10,
  sellPrice: 100,
  adjustedFee: 200
});
assert.deepEqual(sp3.map(({ label }) => label), ['正價', '半工', '免工', '全單 95 折']);
assert.deepEqual(sp3.map(({ appliedFee }) => appliedFee), [200, 100, 0, 200]);
assert.deepEqual(sp3.map(({ preTaxAmount }) => preTaxAmount), [1200, 1100, 1000, 1140]);
assert.deepEqual(sp3.map(({ taxAmount }) => taxAmount), [108, 99, 90, 102.6]);
assert.deepEqual(sp3.map(({ totalAmount }) => totalAmount), [1308, 1199, 1090, 1242.6]);

const decimalFee = OverseasQuote.calculateOverseasQuotes({
  storeCode: 'MY1',
  weightGram: 2,
  sellPrice: 50,
  adjustedFee: 12.5
});
assert.equal(decimalFee[0].preTaxAmount, 112.5);
assert.equal(decimalFee[0].taxAmount, 0);
assert.equal(decimalFee[0].totalAmount, 112.5);
assert.throws(
  () => OverseasQuote.calculateOverseasQuotes({ storeCode: 'SP3', weightGram: 1, sellPrice: 100, adjustedFee: '' }),
  /請輸入工費/
);
assert.throws(
  () => OverseasQuote.calculateOverseasQuotes({ storeCode: 'SP3', weightGram: 1, sellPrice: 100, adjustedFee: -1 }),
  /有效工費/
);
assert.throws(
  () => OverseasQuote.calculateOverseasQuotes({ storeCode: '', weightGram: 1, sellPrice: 100, adjustedFee: 0 }),
  /請先選擇海外店舖/
);

assert.deepEqual(OverseasQuote.feeStateFromQr(88.5), { originalFee: 88.5, adjustedFee: '88.5' });
assert.deepEqual(OverseasQuote.feeStateFromQr(null), { originalFee: null, adjustedFee: '' });
assert.equal(parseQrPayload('ITEM/MODEL/1/C/D/E/').fee, null);
const firstItem = OverseasQuote.feeStateFromQr(100);
const nextItem = OverseasQuote.feeStateFromQr(250);
assert.equal(firstItem.adjustedFee, '100');
assert.equal(nextItem.adjustedFee, '250');

const switchedStore = OverseasQuote.storeSelectionState('UK1', '250');
assert.equal(switchedStore.currencyCode, 'GBP');
assert.equal(switchedStore.sellPrice, '');
assert.equal(switchedStore.adjustedFee, '250');
assert.equal(switchedStore.quotes, null);

const summary = OverseasQuote.createOverseasSummary({
  storeCode: 'SP3',
  itemNo: 'ITEM001',
  modelNo: 'MODEL9',
  weightGram: 10,
  sellPrice: 100,
  originalFee: 200,
  adjustedFee: 200,
  quotes: sp3
});
for (const expected of [
  '營運地區：海外地區',
  '國家／地區：新加坡',
  '店舖：SP3',
  '貨幣：SGD',
  '貨號：ITEM001',
  '模號：MODEL9',
  '金重：10 克',
  '使用售出價：SGD 100.00／克',
  '原工費：SGD 200.00',
  '調整後工費：SGD 200.00',
  '【半工】',
  '採用工費：SGD 100.00',
  'GST：9%',
  '含稅總額：SGD 1,199.00',
  '以上數據只作參考，一切以金星系統數據為準。'
]) {
  assert.ok(summary.includes(expected), `summary is missing: ${expected}`);
}

const missingOriginalFeeSummary = OverseasQuote.createOverseasSummary({
  storeCode: 'MY1',
  weightGram: 1,
  sellPrice: 100,
  originalFee: null,
  adjustedFee: 0,
  quotes: OverseasQuote.calculateOverseasQuotes({
    storeCode: 'MY1', weightGram: 1, sellPrice: 100, adjustedFee: 0
  })
});
assert.ok(missingOriginalFeeSummary.includes('原工費：未有資料'));

const overseasSource = fs.readFileSync('assets/js/overseas-quote.js', 'utf8');
assert.ok(!overseasSource.includes('1.02'), 'overseas calculation must not multiply by 1.02');

const domesticQuotes = calculateQuotes({ weightGram: 10, fee: 1000, sellPrice: 800, unit: 'gram' });
assert.deepEqual(domesticQuotes.map(({ amount }) => amount), [9000, 8500, 8000, 8550]);
assert.match(fs.readFileSync('main-tool.html', 'utf8'), /subTotal \* 1\.02/, 'existing Hong Kong/Macao calculation changed');

console.log('overseas quote tests passed');
