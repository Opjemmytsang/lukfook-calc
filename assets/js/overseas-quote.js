(() => {
  'use strict';

  const RegionConfig = typeof module !== 'undefined' && module.exports
    ? require('./region-config.js')
    : window.LukfookRegionConfig;

  const DISCLAIMER = '以上數據只作參考，一切以金星系統數據為準。';
  const AUTHORIZATION_LINES = Object.freeze([
    '開單時需要當值主管授權',
    '开单时需要当值主管授权',
    'Duty manager authorization is required when issuing the sales order.'
  ]);
  const GOLDSTAR_REQUIRED_MESSAGE = [
    '請輸入當地金星電視價錢。',
    '请输入当地金星电视价钱。',
    'Please enter the local Goldstar display price.'
  ].join('\n');
  const SCENARIOS = Object.freeze([
    { key: 'regular', label: '正價', preTax: (baseAmount) => baseAmount },
    { key: 'full95', label: '全單 95 折', preTax: (baseAmount) => baseAmount * 0.95 }
  ]);

  function numberValue(value) {
    if (value === '' || value === null || value === undefined) return null;
    const parsed = Number(String(value).replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function feeStateFromQr(fee) {
    const parsed = numberValue(fee);
    return {
      originalFee: parsed !== null && parsed >= 0 ? parsed : null,
      discountPercent: '100',
      adjustmentAmount: '0',
      manualOverride: false,
      manualFee: ''
    };
  }

  function calculateFinalFee({
    originalFee,
    discountPercent,
    adjustmentAmount,
    manualOverride = false,
    manualFee = ''
  }) {
    const original = numberValue(originalFee);
    const discount = numberValue(discountPercent);
    const adjustment = numberValue(adjustmentAmount);
    if (original === null || original < 0) throw new Error('請輸入有效原工費。');
    if (discount === null || discount < 0 || discount > 100) throw new Error('工費折扣必須為 0 至 100%。');
    if (adjustment === null) throw new Error('請輸入有效額外加減金額。');

    if (manualOverride) {
      const overriddenFee = numberValue(manualFee);
      if (manualFee === '') throw new Error('請輸入最後實收工費。');
      if (overriddenFee === null || overriddenFee < 0) throw new Error('請輸入有效最後實收工費。');
      return {
        originalFee: original,
        discountPercent: discount,
        adjustmentAmount: adjustment,
        finalFee: overriddenFee,
        manualOverride: true,
        clampedToZero: false
      };
    }

    const calculatedFee = original * (discount / 100) + adjustment;
    return {
      originalFee: original,
      discountPercent: discount,
      adjustmentAmount: adjustment,
      finalFee: Math.max(0, calculatedFee),
      manualOverride: false,
      clampedToZero: calculatedFee < 0
    };
  }

  function requiresAuthorization(originalFee, finalFee) {
    const original = numberValue(originalFee);
    const actual = numberValue(finalFee);
    return original !== null && original > 0
      && actual !== null && actual >= 0
      && actual < original * 0.3;
  }

  function storeSelectionState(storeCode, feeState = feeStateFromQr(null)) {
    const store = RegionConfig.getStoreConfig(storeCode);
    return {
      store,
      currencyCode: store?.currencyCode || '',
      goldstarPrice: '',
      feeState,
      quotes: null
    };
  }

  function calculateOverseasQuotes({ storeCode, goldstarPrice, finalFee }) {
    const store = RegionConfig.getStoreConfig(storeCode);
    if (!store) throw new Error('請先選擇海外店舖。');
    const displayPrice = numberValue(goldstarPrice);
    const actualFee = numberValue(finalFee);
    if (goldstarPrice === '') throw new Error(GOLDSTAR_REQUIRED_MESSAGE);
    if (displayPrice === null || displayPrice < 0) throw new Error('請輸入有效金星電視價錢。');
    if (finalFee === '') throw new Error('請輸入最後實收工費。');
    if (actualFee === null || actualFee < 0) throw new Error('請輸入有效最後實收工費。');

    const discountBeforeAmount = displayPrice + actualFee;
    return SCENARIOS.map((scenario) => {
      const preTaxAmount = scenario.preTax(discountBeforeAmount);
      const taxAmount = preTaxAmount * store.totalTaxRate;
      return {
        key: scenario.key,
        label: scenario.label,
        goldstarPrice: displayPrice,
        finalFee: actualFee,
        discountBeforeAmount,
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

  function createOverseasSummary({
    storeCode,
    itemNo,
    modelNo,
    weightGram,
    goldstarPrice,
    feeCalculation,
    quotes
  }) {
    const store = RegionConfig.getStoreConfig(storeCode);
    if (!store || !feeCalculation || !Array.isArray(quotes)) throw new Error('未有完整海外報價資料。');
    const currency = store.currencyCode;
    const finalFeeSuffix = feeCalculation.manualOverride ? '（已手動調整）' : '';
    const weight = numberValue(weightGram);
    const lines = [
      '六福珠寶智能報價 DEMO',
      '',
      '營運地區：海外地區',
      `國家／地區：${store.regionName}`,
      `店舖：${store.storeCode}`,
      `貨幣：${currency}`,
      `貨號：${itemNo || '-'}`,
      `模號：${modelNo || '-'}`,
      `金重：${weight === null ? '-' : weight.toLocaleString('zh-HK', { maximumFractionDigits: 3 })} 克`,
      `金星電視價錢：${formatMoney(numberValue(goldstarPrice), currency)}`,
      `原工費：${formatMoney(feeCalculation.originalFee, currency)}`,
      `工費折扣：${Number(feeCalculation.discountPercent).toLocaleString('zh-HK', { maximumFractionDigits: 2 })}%`,
      `額外加減金額：${formatMoney(feeCalculation.adjustmentAmount, currency)}`,
      `最後實收工費：${formatMoney(feeCalculation.finalFee, currency)}${finalFeeSuffix}`
    ];

    taxLines(store).forEach(({ name, rate }) => lines.push(`${name}：${formatRate(rate)}`));
    lines.push('');
    quotes.forEach((quote) => {
      lines.push(`【${quote.label}】`);
      if (quote.key === 'full95') {
        lines.push(`95 折稅前金額：${formatMoney(quote.preTaxAmount, currency)}`);
      } else {
        lines.push(`稅前金額：${formatMoney(quote.preTaxAmount, currency)}`);
      }
      lines.push(
        `稅額：${formatMoney(quote.taxAmount, currency)}`,
        `含稅總額：${formatMoney(quote.totalAmount, currency)}`,
        ''
      );
    });

    if (requiresAuthorization(feeCalculation.originalFee, feeCalculation.finalFee)) {
      lines.push(...AUTHORIZATION_LINES, '');
    }
    lines.push(DISCLAIMER);
    return lines.join('\n');
  }

  const api = {
    AUTHORIZATION_LINES,
    GOLDSTAR_REQUIRED_MESSAGE,
    SCENARIOS,
    numberValue,
    feeStateFromQr,
    calculateFinalFee,
    requiresAuthorization,
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
