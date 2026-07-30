(() => {
  'use strict';

  const RegionConfig = typeof module !== 'undefined' && module.exports
    ? require('./region-config.js')
    : window.LukfookRegionConfig;

  const DISCLAIMER = '以上數據只作參考，一切以金星系統數據為準。';
  const SCENARIOS = Object.freeze([
    { key: 'regular', label: '正價', feeFactor: 1, preTax: (gold, fee) => gold + fee },
    { key: 'halfFee', label: '半工', feeFactor: 0.5, preTax: (gold, fee) => gold + fee * 0.5 },
    { key: 'noFee', label: '免工', feeFactor: 0, preTax: (gold) => gold },
    { key: 'full95', label: '全單 95 折', feeFactor: 1, preTax: (gold, fee) => (gold + fee) * 0.95 }
  ]);

  function numberValue(value) {
    if (value === '' || value === null || value === undefined) return null;
    const parsed = Number(String(value).replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function feeStateFromQr(fee) {
    const parsed = numberValue(fee);
    if (parsed === null || parsed < 0) return { originalFee: null, adjustedFee: '' };
    return { originalFee: parsed, adjustedFee: String(parsed) };
  }

  function storeSelectionState(storeCode, adjustedFee = '') {
    const store = RegionConfig.getStoreConfig(storeCode);
    return {
      store,
      currencyCode: store?.currencyCode || '',
      sellPrice: '',
      adjustedFee,
      quotes: null
    };
  }

  function calculateOverseasQuotes({ storeCode, weightGram, sellPrice, adjustedFee }) {
    const store = RegionConfig.getStoreConfig(storeCode);
    if (!store) throw new Error('請先選擇海外店舖。');
    const weight = numberValue(weightGram);
    const price = numberValue(sellPrice);
    const fee = numberValue(adjustedFee);
    if (weight === null || weight <= 0) throw new Error('請輸入有效金重。');
    if (price === null || price <= 0) throw new Error('請輸入有效售出價。');
    if (adjustedFee === '') throw new Error('請輸入工費。');
    if (fee === null || fee < 0) throw new Error('請輸入有效工費。');

    const goldAmount = weight * price;
    return SCENARIOS.map((scenario) => {
      const appliedFee = fee * scenario.feeFactor;
      const preTaxAmount = scenario.preTax(goldAmount, fee);
      const taxAmount = preTaxAmount * store.totalTaxRate;
      return {
        key: scenario.key,
        label: scenario.label,
        goldAmount,
        appliedFee,
        preTaxAmount,
        taxRate: store.totalTaxRate,
        taxAmount,
        totalAmount: preTaxAmount + taxAmount
      };
    });
  }

  function formatRate(rate) {
    return `${Number((rate * 100).toFixed(3)).toLocaleString('zh-HK', { maximumFractionDigits: 3 })}%`;
  }

  function taxLines(store, { includeTotal = true } = {}) {
    if (!store) return [];
    if (store.taxComponents.length === 0) return [{ name: '稅率', rate: 0 }];
    const lines = store.taxComponents.map(({ name, rate }) => ({ name, rate }));
    if (includeTotal && (store.taxComponents.length > 1 || store.regionCode === 'CA')) {
      lines.push({ name: '總稅率', rate: store.totalTaxRate });
    }
    return lines;
  }

  function formatMoney(value, currencyCode) {
    return `${currencyCode} ${value.toLocaleString('zh-HK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function createOverseasSummary({ storeCode, itemNo, modelNo, weightGram, sellPrice, originalFee, adjustedFee, quotes }) {
    const store = RegionConfig.getStoreConfig(storeCode);
    if (!store || !Array.isArray(quotes)) throw new Error('未有完整海外報價資料。');
    const originalFeeText = originalFee === null
      ? '未有資料'
      : formatMoney(numberValue(originalFee), store.currencyCode);
    const lines = [
      '六福珠寶智能報價 DEMO',
      '',
      '營運地區：海外地區',
      `國家／地區：${store.regionName}`,
      `店舖：${store.storeCode}`,
      `貨幣：${store.currencyCode}`,
      `貨號：${itemNo || '-'}`,
      `模號：${modelNo || '-'}`,
      `金重：${numberValue(weightGram).toLocaleString('zh-HK', { maximumFractionDigits: 3 })} 克`,
      `使用售出價：${formatMoney(numberValue(sellPrice), store.currencyCode)}／克`,
      `原工費：${originalFeeText}`,
      `調整後工費：${formatMoney(numberValue(adjustedFee), store.currencyCode)}`,
      ''
    ];

    quotes.forEach((quote) => {
      lines.push(
        `【${quote.label}】`,
        `金價金額：${formatMoney(quote.goldAmount, store.currencyCode)}`,
        `採用工費：${formatMoney(quote.appliedFee, store.currencyCode)}`,
        `稅前金額：${formatMoney(quote.preTaxAmount, store.currencyCode)}`
      );
      taxLines(store).forEach(({ name, rate }) => lines.push(`${name}：${formatRate(rate)}`));
      lines.push(
        `稅額：${formatMoney(quote.taxAmount, store.currencyCode)}`,
        `含稅總額：${formatMoney(quote.totalAmount, store.currencyCode)}`,
        ''
      );
    });
    lines.push(DISCLAIMER);
    return lines.join('\n');
  }

  const api = {
    SCENARIOS,
    numberValue,
    feeStateFromQr,
    storeSelectionState,
    calculateOverseasQuotes,
    formatRate,
    taxLines,
    formatMoney,
    createOverseasSummary
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.LukfookOverseasQuote = api;
})();
