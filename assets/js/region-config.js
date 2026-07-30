(() => {
  'use strict';

  const OVERSEAS_STORES = Object.freeze([
    { marketGroup: 'overseas', regionCode: 'US', regionName: '美國', storeCode: 'US2', currencyCode: 'USD', taxType: 'Sales Tax', taxComponents: [{ name: 'Sales Tax', rate: 0.08875 }], totalTaxRate: 0.08875 },
    { marketGroup: 'overseas', regionCode: 'US', regionName: '美國', storeCode: 'US4', currencyCode: 'USD', taxType: 'Sales Tax', taxComponents: [{ name: 'Sales Tax', rate: 0.08875 }], totalTaxRate: 0.08875 },
    { marketGroup: 'overseas', regionCode: 'US', regionName: '美國', storeCode: 'US5', currencyCode: 'USD', taxType: 'Sales Tax', taxComponents: [{ name: 'Sales Tax', rate: 0.08625 }], totalTaxRate: 0.08625 },
    { marketGroup: 'overseas', regionCode: 'US', regionName: '美國', storeCode: 'US6', currencyCode: 'USD', taxType: 'Sales Tax', taxComponents: [{ name: 'Sales Tax', rate: 0.09375 }], totalTaxRate: 0.09375 },
    { marketGroup: 'overseas', regionCode: 'US', regionName: '美國', storeCode: 'US7', currencyCode: 'USD', taxType: 'Sales Tax', taxComponents: [{ name: 'Sales Tax', rate: 0.105 }], totalTaxRate: 0.105 },
    { marketGroup: 'overseas', regionCode: 'US', regionName: '美國', storeCode: 'US8', currencyCode: 'USD', taxType: 'Sales Tax', taxComponents: [{ name: 'Sales Tax', rate: 0.08875 }], totalTaxRate: 0.08875 },
    { marketGroup: 'overseas', regionCode: 'CA', regionName: '加拿大', storeCode: 'BC2', currencyCode: 'CAD', taxType: 'GST/PST', taxComponents: [{ name: 'GST', rate: 0.05 }, { name: 'PST', rate: 0.07 }], totalTaxRate: 0.12 },
    { marketGroup: 'overseas', regionCode: 'CA', regionName: '加拿大', storeCode: 'CA5', currencyCode: 'CAD', taxType: 'HST', taxComponents: [{ name: 'HST', rate: 0.13 }], totalTaxRate: 0.13 },
    { marketGroup: 'overseas', regionCode: 'CA', regionName: '加拿大', storeCode: 'CA6', currencyCode: 'CAD', taxType: 'HST', taxComponents: [{ name: 'HST', rate: 0.13 }], totalTaxRate: 0.13 },
    { marketGroup: 'overseas', regionCode: 'AU', regionName: '澳洲', storeCode: 'AU2', currencyCode: 'AUD', taxType: 'GST', taxComponents: [{ name: 'GST', rate: 0.10 }], totalTaxRate: 0.10 },
    { marketGroup: 'overseas', regionCode: 'AU', regionName: '澳洲', storeCode: 'AU7', currencyCode: 'AUD', taxType: 'GST', taxComponents: [{ name: 'GST', rate: 0.10 }], totalTaxRate: 0.10 },
    { marketGroup: 'overseas', regionCode: 'AU', regionName: '澳洲', storeCode: 'AU3', currencyCode: 'AUD', taxType: 'GST', taxComponents: [{ name: 'GST', rate: 0.10 }], totalTaxRate: 0.10 },
    { marketGroup: 'overseas', regionCode: 'AU', regionName: '澳洲', storeCode: 'AU5', currencyCode: 'AUD', taxType: 'GST', taxComponents: [{ name: 'GST', rate: 0.10 }], totalTaxRate: 0.10 },
    { marketGroup: 'overseas', regionCode: 'AU', regionName: '澳洲', storeCode: 'AU6', currencyCode: 'AUD', taxType: 'GST', taxComponents: [{ name: 'GST', rate: 0.10 }], totalTaxRate: 0.10 },
    { marketGroup: 'overseas', regionCode: 'AU', regionName: '澳洲', storeCode: 'AU8', currencyCode: 'AUD', taxType: 'GST', taxComponents: [{ name: 'GST', rate: 0.10 }], totalTaxRate: 0.10 },
    { marketGroup: 'overseas', regionCode: 'MY', regionName: '馬來西亞', storeCode: 'MY1', currencyCode: 'MYR', taxType: '稅率', taxComponents: [], totalTaxRate: 0 },
    { marketGroup: 'overseas', regionCode: 'MY', regionName: '馬來西亞', storeCode: 'MY2', currencyCode: 'MYR', taxType: '稅率', taxComponents: [], totalTaxRate: 0 },
    { marketGroup: 'overseas', regionCode: 'MY', regionName: '馬來西亞', storeCode: 'MY4', currencyCode: 'MYR', taxType: '稅率', taxComponents: [], totalTaxRate: 0 },
    { marketGroup: 'overseas', regionCode: 'MY', regionName: '馬來西亞', storeCode: 'MY5', currencyCode: 'MYR', taxType: '稅率', taxComponents: [], totalTaxRate: 0 },
    { marketGroup: 'overseas', regionCode: 'MY', regionName: '馬來西亞', storeCode: 'MY7', currencyCode: 'MYR', taxType: '稅率', taxComponents: [], totalTaxRate: 0 },
    { marketGroup: 'overseas', regionCode: 'SG', regionName: '新加坡', storeCode: 'SP3', currencyCode: 'SGD', taxType: 'GST', taxComponents: [{ name: 'GST', rate: 0.09 }], totalTaxRate: 0.09 },
    { marketGroup: 'overseas', regionCode: 'SG', regionName: '新加坡', storeCode: 'SP4', currencyCode: 'SGD', taxType: 'GST', taxComponents: [{ name: 'GST', rate: 0.09 }], totalTaxRate: 0.09 },
    { marketGroup: 'overseas', regionCode: 'UK', regionName: '英國', storeCode: 'UK1', currencyCode: 'GBP', taxType: 'VAT', taxComponents: [{ name: 'VAT', rate: 0.20 }], totalTaxRate: 0.20 }
  ]);

  const REGION_ORDER = Object.freeze(['US', 'CA', 'AU', 'MY', 'SG', 'UK']);

  function getRegions() {
    return REGION_ORDER.map((regionCode) => {
      const store = OVERSEAS_STORES.find((item) => item.regionCode === regionCode);
      return { regionCode, regionName: store.regionName };
    });
  }

  function getStoresByRegion(regionCode) {
    return OVERSEAS_STORES.filter((store) => store.regionCode === regionCode);
  }

  function getStoreConfig(storeCode) {
    return OVERSEAS_STORES.find((store) => store.storeCode === storeCode) || null;
  }

  const api = { OVERSEAS_STORES, getRegions, getStoresByRegion, getStoreConfig };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.LukfookRegionConfig = api;
})();
