'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const RegionConfig = require('../assets/js/region-config.js');
const OverseasQuote = require('../assets/js/overseas-quote.js');
const { calculateQuotes } = require('../assets/js/smart-quote.js');

const expectedRates = {
  US2: 0.08875, US4: 0.08875, US5: 0.08625, US6: 0.10, US7: 0.105, US8: 0.08875,
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

function fee(overrides = {}) {
  return OverseasQuote.calculateFinalFee({
    originalFee: 100,
    discountPercent: 100,
    adjustmentAmount: 0,
    manualOverride: false,
    manualFee: '',
    ...overrides
  });
}

assert.equal(fee({ discountPercent: 50, adjustmentAmount: -10 }).finalFee, 40);
assert.equal(fee({ discountPercent: 50, adjustmentAmount: 10 }).finalFee, 60);
const exactlyThirty = fee({ discountPercent: 30 });
assert.equal(exactlyThirty.finalFee, 30);
assert.equal(OverseasQuote.requiresAuthorization(100, exactlyThirty.finalFee), false);
const belowThirty = fee({ discountPercent: 30, adjustmentAmount: -1 });
assert.equal(belowThirty.finalFee, 29);
assert.equal(OverseasQuote.requiresAuthorization(100, belowThirty.finalFee), true);
assert.equal(OverseasQuote.requiresAuthorization(100, 29.99), true);
assert.equal(OverseasQuote.requiresAuthorization(100, 30), false);
assert.equal(OverseasQuote.requiresAuthorization(100, 30.01), false);
assert.equal(OverseasQuote.requiresAuthorization(0, 0), false);
assert.equal(OverseasQuote.requiresAuthorization('', 0), false);
assert.equal(OverseasQuote.requiresAuthorization(null, 0), false);
assert.equal(fee({ discountPercent: 20, adjustmentAmount: 15 }).finalFee, 35);

const clamped = fee({ discountPercent: 20, adjustmentAmount: -30 });
assert.equal(clamped.finalFee, 0);
assert.equal(clamped.clampedToZero, true);

const manual = fee({ discountPercent: 50, adjustmentAmount: -10, manualOverride: true, manualFee: 35 });
assert.equal(manual.finalFee, 35);
assert.equal(manual.manualOverride, true);
assert.equal(fee({ discountPercent: 50, adjustmentAmount: -10, manualOverride: false, manualFee: 35 }).finalFee, 40);
assert.throws(() => fee({ discountPercent: -1 }), /0 至 100/);
assert.throws(() => fee({ discountPercent: 101 }), /0 至 100/);
assert.throws(() => fee({ originalFee: -1 }), /有效原工費/);
assert.throws(() => fee({ manualOverride: true, manualFee: '' }), /請輸入最後實收工費/);
assert.throws(() => fee({ manualOverride: true, manualFee: -1 }), /有效最後實收工費/);

const sp3 = OverseasQuote.calculateOverseasQuotes({ weightGram: 1,
  storeCode: 'SP3',
  goldstarPrice: 1000,
  finalFee: 40
});
assert.deepEqual(sp3.map(({ label }) => label), ['正價', '全單折扣（實收 95%）']);
assert.deepEqual(sp3.map(({ preTaxAmount }) => preTaxAmount), [1040, 988]);
assert.deepEqual(sp3.map(({ taxAmount }) => taxAmount), [93.6, 88.92]);
assert.deepEqual(sp3.map(({ totalAmount }) => totalAmount), [1133.6, 1076.92]);
assert.equal(sp3[0].goldstarPrice, 1000);
assert.equal(sp3[0].finalFee, 40);
assert.equal(sp3[0].goldAmount, 1000);

const bc2 = OverseasQuote.calculateOverseasQuotes({ weightGram: 1,
  storeCode: 'BC2',
  goldstarPrice: 1000,
  finalFee: 0
});
assert.equal(bc2[0].taxAmount, 120);
assert.equal(bc2[0].totalAmount, 1120);
assert.deepEqual(OverseasQuote.taxLines(RegionConfig.getStoreConfig('BC2')), [
  { name: 'GST', rate: 0.05 },
  { name: 'PST', rate: 0.07 },
  { name: '總稅率', rate: 0.12 }
]);

assert.equal(OverseasQuote.calculateOverseasQuotes({ weightGram: 1, storeCode: 'MY1', goldstarPrice: 100, finalFee: 0 })[0].totalAmount, 100);
assert.throws(
  () => OverseasQuote.calculateOverseasQuotes({ weightGram: 1, storeCode: 'SP3', goldstarPrice: '', finalFee: 0 }),
  /請輸入當地每克金價/
);
for (const line of [
  '請輸入當地每克金價。',
  '请输入当地每克金价。',
  'Please enter the local gold price per gram.'
]) {
  assert.ok(OverseasQuote.GOLDSTAR_REQUIRED_MESSAGE.includes(line));
}
assert.throws(
  () => OverseasQuote.calculateOverseasQuotes({ weightGram: 1, storeCode: 'SP3', goldstarPrice: -1, finalFee: 0 }),
  /有效每克金價/
);
assert.throws(
  () => OverseasQuote.calculateOverseasQuotes({ weightGram: 1, storeCode: 'SP3', goldstarPrice: 100, finalFee: '' }),
  /請輸入最後實收工費/
);

assert.deepEqual(OverseasQuote.feeStateFromQr(88.5), {
  originalFee: 88.5,
  discountPercent: '100',
  adjustmentAmount: '0',
  manualOverride: false,
  manualFee: ''
});
assert.equal(OverseasQuote.feeStateFromQr(null).originalFee, null);
const nextItem = OverseasQuote.feeStateFromQr(250);
assert.equal(nextItem.discountPercent, '100');
assert.equal(nextItem.adjustmentAmount, '0');
assert.equal(nextItem.manualOverride, false);
assert.equal(nextItem.manualFee, '');

const switchedStore = OverseasQuote.storeSelectionState('UK1', nextItem);
assert.equal(switchedStore.currencyCode, 'GBP');
assert.equal(switchedStore.goldstarPrice, '');
assert.equal(switchedStore.feeState.originalFee, 250);
assert.equal(switchedStore.quotes, null);

const authorizedSummary = OverseasQuote.createOverseasSummary({
  storeCode: 'SP3',
  itemNo: 'ITEM001',
  modelNo: 'MODEL9',
  weightGram: 10,
  goldstarPrice: 1000,
  feeCalculation: belowThirty,
  quotes: OverseasQuote.calculateOverseasQuotes({ weightGram: 1,
    storeCode: 'SP3', goldstarPrice: 1000, finalFee: belowThirty.finalFee
  })
});
for (const expected of [
  '營運地區：海外地區',
  '國家／地區：新加坡',
  '店舖：SP3',
  '貨幣：SGD',
  '貨號：ITEM001',
  '模號：MODEL9',
  '金重：10 克',
  '每克金價：SGD 1,000.00／克',
  '原工費：SGD 100.00',
  '工費折扣：30%',
  '額外加減金額：SGD -1.00',
  '最後實收工費：SGD 29.00',
  'GST：9%',
  '【正價】',
  '稅前金額：SGD 1,029.00',
  '【全單折扣（實收 95%）】',
  '折後稅前售價：SGD 977.55',
  ...OverseasQuote.AUTHORIZATION_LINES,
  '以上數據只作參考，一切以金星系統數據為準。'
]) {
  assert.ok(authorizedSummary.includes(expected), `summary is missing: ${expected}`);
}
assert.ok(!authorizedSummary.includes('半工'));
assert.ok(!authorizedSummary.includes('免工'));
assert.ok(!authorizedSummary.includes('每克售出價'));
assert.ok(!authorizedSummary.includes('金價金額'));

const manualSummary = OverseasQuote.createOverseasSummary({
  storeCode: 'SP3',
  weightGram: 1,
  goldstarPrice: 100,
  feeCalculation: manual,
  quotes: OverseasQuote.calculateOverseasQuotes({ weightGram: 1,
    storeCode: 'SP3', goldstarPrice: 100, finalFee: manual.finalFee
  })
});
assert.ok(manualSummary.includes('最後實收工費：SGD 35.00（已手動調整）'));

const overseasSource = fs.readFileSync('assets/js/overseas-quote.js', 'utf8');
assert.ok(!overseasSource.includes('1.02'), 'overseas calculation must not multiply by 1.02');

assert.ok(!overseasSource.includes('GOLD_PRICE_API'), 'overseas module must not use Hong Kong gold price API');

const domesticQuotes = calculateQuotes({ weightGram: 10, fee: 1000, sellPrice: 800, unit: 'gram' });
assert.deepEqual(domesticQuotes.map(({ label }) => label), ['正價', '半工', '免工', '全單 95 折']);
assert.deepEqual(domesticQuotes.map(({ amount }) => amount), [9000, 8500, 8000, 8550]);
assert.match(fs.readFileSync('main-tool.html', 'utf8'), /subTotal \* 1\.02/, 'existing Hong Kong/Macao calculation changed');

console.log('overseas quote tests passed');

// Confirmed user example: weight × price + adjusted fee, discount, then tax.
const example = OverseasQuote.calculateOverseasQuotes({storeCode:'US6',goldstarPrice:200,weightGram:10,finalFee:100,discountPercent:95});
assert.equal(example[0].totalAmount, 2310);
assert.equal(example[1].preTaxAmount,1995);
assert.equal(example[1].taxAmount,199.5);
assert.equal(example[1].totalAmount,2194.5);
assert.equal(OverseasQuote.calculateOverseasQuotes({storeCode:'AU2',goldstarPrice:200,weightGram:10,finalFee:100,discountPercent:80})[1].totalAmount,1848);
for (const weightGram of ['',0,-1,NaN,undefined]) assert.throws(()=>OverseasQuote.calculateOverseasQuotes({storeCode:'US6',goldstarPrice:200,weightGram,finalFee:0}),/金重/);
for (const discountPercent of ['',0,-1,101,NaN]) assert.throws(()=>OverseasQuote.calculateOverseasQuotes({storeCode:'US6',goldstarPrice:200,weightGram:10,finalFee:0,discountPercent}),/折扣/);
