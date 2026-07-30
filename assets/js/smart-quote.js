(() => {
  'use strict';

  const GOLD_PRICE_API = 'https://lukfook-goldprice-proxy.arwing28.workers.dev';
  const GRAMS_PER_TAEL = 37.429;
  const DISCLAIMER = '以上數據只作參考，一切以金星系統數據為準。';
  const RegionConfig = typeof window !== 'undefined' ? window.LukfookRegionConfig : null;
  const OverseasQuote = typeof window !== 'undefined' ? window.LukfookOverseasQuote : null;
  const SCENARIOS = [
    { key: 'regular', label: '正價', formula: (gold, fee) => gold + fee },
    { key: 'halfFee', label: '半工', formula: (gold, fee) => gold + fee * 0.5 },
    { key: 'noFee', label: '免工', formula: (gold) => gold },
    { key: 'full95', label: '全單 95 折', formula: (gold, fee) => (gold + fee) * 0.95 }
  ];

  const $ = (id) => document.getElementById(id);
  const elements = {};
  let scanner = null;
  let scannerStarting = false;
  let imageScanning = false;
  let livePrice = null;
  let priceFetchController = null;
  let originalFee = null;
  let latestOverseasQuotes = null;

  function finiteNumber(value) {
    if (value === '' || value === null || value === undefined) return null;
    const parsed = Number(String(value).replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function positivePrice(value) {
    const parsed = finiteNumber(value);
    return parsed !== null && parsed > 0 ? parsed : null;
  }

  function safeIdentifier(value) {
    return String(value ?? '')
      .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
  }

  function parseQrPayload(rawValue) {
    const rawText = String(rawValue ?? '').trim();
    if (!rawText || rawText.length > 4096) throw new Error('QR Code 資料不完整，請重新掃描。');
    const fields = rawText.split('/');
    if (fields.length < 7) throw new Error('QR Code 資料不完整，請重新掃描。');
    const weight = finiteNumber(fields[2]);
    const feeText = String(fields[6] ?? '').trim();
    const fee = feeText === '' ? null : finiteNumber(feeText);
    if (weight === null || weight <= 0) throw new Error('QR Code 內的金重並非有效數字，請重新掃描。');
    if (feeText !== '' && (fee === null || fee < 0)) throw new Error('QR Code 內的工費／標價並非有效數字，請重新掃描。');
    return {
      itemNo: safeIdentifier(fields[0]),
      modelNo: safeIdentifier(fields[1]),
      weight,
      fee
    };
  }

  function calculateQuotes({ weightGram, fee, sellPrice, unit }) {
    const weight = finiteNumber(weightGram);
    const labor = finiteNumber(fee);
    const price = positivePrice(sellPrice);
    if (weight === null || weight <= 0) throw new Error('請輸入有效金重。');
    if (labor === null || labor < 0) throw new Error('請輸入有效工費／標價。');
    if (price === null) throw new Error('請輸入有效售出價。');
    if (!['gram', 'tael'].includes(unit)) throw new Error('金價單位不正確。');
    const pricePerGram = unit === 'gram' ? price : price / GRAMS_PER_TAEL;
    const goldAmount = weight * pricePerGram;
    return SCENARIOS.map((scenario) => ({
      key: scenario.key,
      label: scenario.label,
      amount: scenario.formula(goldAmount, labor)
    }));
  }

  function formatMoney(value) {
    return `HK$ ${value.toLocaleString('zh-HK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function isOverseas() {
    return elements.marketGroup?.value === 'overseas';
  }

  function createSummary({ itemNo, modelNo, weight, fee, sellPrice, unit, quotes }) {
    const unitLabel = unit === 'gram' ? '克' : '両';
    return [
      '六福珠寶智能報價 DEMO',
      '',
      `貨號：${itemNo || '-'}`,
      `模號：${modelNo || '-'}`,
      `金重：${weight.toLocaleString('zh-HK', { maximumFractionDigits: 3 })} 克`,
      `工費／標價：${formatMoney(fee)}`,
      `使用售出價：${formatMoney(sellPrice)}／${unitLabel}`,
      '',
      ...quotes.map(({ label, amount }) => `${label}：${formatMoney(amount)}`),
      '',
      DISCLAIMER
    ].join('\n');
  }

  function setStatus(element, message, type = '') {
    if (!element) return;
    element.textContent = message;
    element.className = `status${type ? ` is-${type}` : ''}`;
  }

  function renderEmptyResults() {
    if (!elements.results) return;
    const scenarios = isOverseas() && OverseasQuote ? OverseasQuote.SCENARIOS : SCENARIOS;
    elements.results.replaceChildren(...scenarios.map(({ label }) => {
      const card = document.createElement('article');
      card.className = 'result-card is-empty';
      const name = document.createElement('span');
      name.className = 'result-name';
      name.textContent = label;
      const amount = document.createElement('strong');
      amount.className = 'result-amount';
      amount.textContent = '—';
      card.append(name, amount);
      return card;
    }));
  }

  function addBreakdownRow(container, label, value, className = '') {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = label;
    description.textContent = value;
    if (className) description.className = className;
    row.append(term, description);
    container.append(row);
  }

  function renderOverseasResults(quotes) {
    const store = RegionConfig.getStoreConfig(elements.overseasStore.value);
    const currency = store.currencyCode;
    elements.results.replaceChildren(...quotes.map((quote) => {
      const card = document.createElement('article');
      card.className = 'result-card';
      const name = document.createElement('span');
      name.className = 'result-name';
      name.textContent = quote.label;
      const total = document.createElement('strong');
      total.className = 'result-amount';
      total.textContent = OverseasQuote.formatMoney(quote.totalAmount, currency);
      const details = document.createElement('dl');
      details.className = 'result-breakdown';
      if (quote.key === 'regular') {
        addBreakdownRow(details, '金星電視價錢', OverseasQuote.formatMoney(quote.goldstarPrice, currency));
        addBreakdownRow(details, '最後實收工費', OverseasQuote.formatMoney(quote.finalFee, currency));
        addBreakdownRow(details, '稅前金額', OverseasQuote.formatMoney(quote.preTaxAmount, currency));
      } else {
        addBreakdownRow(details, '折扣前金額', OverseasQuote.formatMoney(quote.discountBeforeAmount, currency));
        addBreakdownRow(details, '95 折稅前金額', OverseasQuote.formatMoney(quote.preTaxAmount, currency));
      }
      const rateText = OverseasQuote.taxLines(store)
        .map(({ name: taxName, rate }) => `${taxName}：${OverseasQuote.formatRate(rate)}`)
        .join('\n');
      addBreakdownRow(details, '稅率', rateText, 'result-tax-lines');
      addBreakdownRow(details, '稅額', OverseasQuote.formatMoney(quote.taxAmount, currency));
      addBreakdownRow(details, '含稅總額', OverseasQuote.formatMoney(quote.totalAmount, currency));
      card.append(name, total, details);
      return card;
    }));
  }

  function updateAuthorizationWarning(feeCalculation = null) {
    const required = isOverseas()
      && feeCalculation
      && OverseasQuote.requiresAuthorization(feeCalculation.originalFee, feeCalculation.finalFee);
    elements.authorizationWarning.hidden = !required;
  }

  function getFeeCalculation() {
    const feeCalculation = OverseasQuote.calculateFinalFee({
      originalFee: elements.originalLaborFee.value,
      discountPercent: elements.feeDiscount.value,
      adjustmentAmount: elements.feeAdjustment.value,
      manualOverride: elements.manualFeeOverride.checked,
      manualFee: elements.finalLaborFee.value
    });
    if (!feeCalculation.manualOverride) {
      elements.finalLaborFee.value = String(feeCalculation.finalFee);
    }
    elements.negativeFeeWarning.hidden = !feeCalculation.clampedToZero;
    updateAuthorizationWarning(feeCalculation);
    return feeCalculation;
  }

  function render() {
    if (!elements.results) return;
    elements.calculationError.hidden = true;
    elements.feeError.hidden = true;
    elements.negativeFeeWarning.hidden = true;
    updateAuthorizationWarning();
    try {
      if (isOverseas()) {
        if (!OverseasQuote || !RegionConfig) throw new Error('海外地區設定未能載入。');
        const feeCalculation = getFeeCalculation();
        const quotes = OverseasQuote.calculateOverseasQuotes({
          storeCode: elements.overseasStore.value,
          goldstarPrice: elements.goldstarPrice.value,
          finalFee: feeCalculation.finalFee
        });
        latestOverseasQuotes = quotes;
        renderOverseasResults(quotes);
        return quotes;
      }
      const quotes = calculateQuotes({
        weightGram: elements.weight.value,
        fee: elements.laborFee.value,
        sellPrice: elements.sellPrice.value,
        unit: elements.priceUnit.value
      });
      elements.results.replaceChildren(...quotes.map(({ label, amount }) => {
        const card = document.createElement('article');
        card.className = 'result-card';
        const name = document.createElement('span');
        name.className = 'result-name';
        name.textContent = label;
        const value = document.createElement('strong');
        value.className = 'result-amount';
        value.textContent = formatMoney(amount);
        card.append(name, value);
        return card;
      }));
      return quotes;
    } catch (error) {
      latestOverseasQuotes = null;
      renderEmptyResults();
      const feeMessage = isOverseas() && /工費/.test(error.message);
      if (feeMessage) {
        elements.feeError.textContent = error.message;
        elements.feeError.hidden = false;
      }
      const hasAnyInput = isOverseas()
        || elements.weight.value || elements.laborFee.value || elements.sellPrice.value;
      if (hasAnyInput) {
        elements.calculationError.textContent = error.message;
        elements.calculationError.hidden = false;
      }
      return null;
    }
  }

  function updateScannerControls({ active = false, loading = false } = {}) {
    if (!elements.startButton || !elements.stopButton) return;
    elements.startButton.disabled = active || loading;
    elements.startButton.textContent = loading ? '正在開啟相機……' : (active ? '掃描中' : '掃描貨品');
    elements.stopButton.disabled = !active && !loading;
  }

  async function stopScanner({ updateStatus = false } = {}) {
    const current = scanner;
    scanner = null;
    scannerStarting = false;
    if (current) {
      try {
        await current.stop();
      } catch (error) {
        // Scanner may not have reached the running state.
      }
      try {
        await current.clear();
      } catch (error) {
        // Reader may already be clear.
      }
    }
    updateScannerControls();
    if (updateStatus) setStatus(elements.scanStatus, '掃描已停止。', 'warn');
  }

  async function applyScannedData(rawValue) {
    const parsed = parseQrPayload(rawValue);
    await stopScanner();
    elements.itemNo.value = parsed.itemNo;
    elements.modelNo.value = parsed.modelNo;
    elements.weight.value = String(parsed.weight);
    originalFee = parsed.fee;
    elements.laborFee.value = parsed.fee === null ? '' : String(parsed.fee);
    const overseasFee = OverseasQuote?.feeStateFromQr(parsed.fee)
      || { originalFee: parsed.fee, discountPercent: '100', adjustmentAmount: '0' };
    elements.originalLaborFee.value = overseasFee.originalFee === null ? '' : String(overseasFee.originalFee);
    elements.originalLaborFee.readOnly = overseasFee.originalFee !== null;
    elements.feeDiscount.value = overseasFee.discountPercent;
    elements.feeAdjustment.value = overseasFee.adjustmentAmount;
    elements.manualFeeOverride.checked = false;
    elements.finalLaborFee.value = '';
    elements.finalLaborFee.readOnly = true;
    elements.goldstarPrice.value = '';
    elements.manualFeeStatus.textContent = '按工費折扣及額外加減金額自動計算。';
    elements.negativeFeeWarning.hidden = true;
    updateAuthorizationWarning();
    elements.itemError.hidden = true;
    elements.feeError.hidden = true;
    setStatus(elements.scanStatus, '已讀取貨品資料。', 'ok');
    render();
    elements.resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function startScanner() {
    if (scannerStarting || scanner) return;
    if (!window.isSecureContext) {
      setStatus(elements.scanStatus, '相機只可在 HTTPS 環境使用。', 'error');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus(elements.scanStatus, '此瀏覽器不支援相機掃描，可改用上載圖片。', 'error');
      return;
    }
    if (!window.Html5Qrcode) {
      elements.libraryStatus.hidden = false;
      setStatus(elements.scanStatus, '掃描功能暫時未能使用，可改用上載圖片。', 'error');
      return;
    }
    elements.libraryStatus.hidden = true;
    scannerStarting = true;
    updateScannerControls({ loading: true });
    setStatus(elements.scanStatus, '正在開啟相機……');
    const nextScanner = new window.Html5Qrcode('reader');
    scanner = nextScanner;
    try {
      const boxSize = Math.min(250, Math.max(190, elements.reader.clientWidth - 32));
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: boxSize, height: boxSize } },
        async (decodedText) => {
          try {
            await applyScannedData(decodedText);
          } catch (error) {
            elements.itemError.textContent = error.message;
            elements.itemError.hidden = false;
            setStatus(elements.scanStatus, '未能讀取，請重新掃描。', 'error');
          }
        },
        () => {}
      );
      if (scanner !== nextScanner) {
        try {
          await nextScanner.stop();
        } catch (stopError) {
          // Stop may already have been requested while the camera was opening.
        }
        try {
          await nextScanner.clear();
        } catch (clearError) {
          // Reader may already be clear.
        }
        updateScannerControls();
        return;
      }
      scannerStarting = false;
      updateScannerControls({ active: true });
      setStatus(elements.scanStatus, '請將 QR Code 放入框內。', 'ok');
    } catch (error) {
      const wasCancelled = scanner !== nextScanner;
      if (scanner === nextScanner) scanner = null;
      scannerStarting = false;
      try {
        await nextScanner.clear();
      } catch (clearError) {
        // Reader may already be clear.
      }
      updateScannerControls();
      if (wasCancelled) return;
      const errorName = String(error?.name || error || '');
      if (/NotAllowed|PermissionDenied/i.test(errorName)) {
        setStatus(elements.scanStatus, '未能開啟相機，請檢查瀏覽器的相機權限。', 'error');
      } else if (/NotFound|DevicesNotFound/i.test(errorName)) {
        setStatus(elements.scanStatus, '未能找到可用相機，可改用上載圖片。', 'error');
      } else if (/Security/i.test(errorName)) {
        setStatus(elements.scanStatus, '相機只可在 HTTPS 環境使用。', 'error');
      } else {
        setStatus(elements.scanStatus, '未能開啟相機，請檢查瀏覽器的相機權限。', 'error');
      }
    }
  }

  async function scanFile(file) {
    if (!file) return;
    if (imageScanning) {
      elements.qrFile.value = '';
      return;
    }
    if (!window.Html5Qrcode) {
      elements.qrFile.value = '';
      setStatus(elements.scanStatus, '掃描功能暫時未能使用，可改用上載圖片。', 'error');
      return;
    }
    imageScanning = true;
    await stopScanner();
    const fileScanner = new window.Html5Qrcode('reader');
    try {
      setStatus(elements.scanStatus, '正在讀取圖片……');
      const decodedText = await fileScanner.scanFile(file, true);
      await applyScannedData(decodedText);
    } catch (error) {
      setStatus(elements.scanStatus, '圖片內未能讀取 QR Code，請選擇較清晰的圖片。', 'error');
    } finally {
      try {
        await fileScanner.clear();
      } catch (clearError) {
        // Reader may already be clear.
      }
      elements.qrFile.value = '';
      imageScanning = false;
    }
  }

  function normalisePricePayload(payload) {
    const gram = positivePrice(payload['克黃金售出'] ?? payload.gold_sell_gram ?? payload.gram_sell ?? payload.gramSell);
    const tael = positivePrice(payload['黃金售出'] ?? payload.gold_sell ?? payload.tael_sell ?? payload.taelSell);
    if (gram === null && tael === null) throw new Error('金價資料不完整');
    return {
      gram: gram ?? tael / GRAMS_PER_TAEL,
      tael: tael ?? gram * GRAMS_PER_TAEL,
      date: String(payload.record_date ?? payload.updated_at ?? payload.update_time ?? '').trim()
    };
  }

  function selectedLivePrice() {
    return livePrice?.[elements.priceUnit.value] ?? null;
  }

  function showLivePrice({ apply = false } = {}) {
    if (isOverseas()) return;
    const price = selectedLivePrice();
    if (price === null) {
      elements.livePrice.textContent = '—';
      return;
    }
    const unitLabel = elements.priceUnit.value === 'gram' ? '克' : '両';
    elements.livePrice.textContent = `${formatMoney(price)}／${unitLabel}`;
    elements.priceTime.textContent = livePrice.date || '未提供';
    if (apply || !positivePrice(elements.sellPrice.value)) elements.sellPrice.value = price.toFixed(2);
    render();
  }

  async function fetchPrice() {
    if (isOverseas()) return;
    priceFetchController?.abort();
    const controller = new AbortController();
    priceFetchController = controller;
    setStatus(elements.priceStatus, '正在讀取今日金價。');
    elements.sourceState.textContent = '連線中';
    try {
      const response = await fetch(GOLD_PRICE_API, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      if (!response.ok) throw new Error('HTTP error');
      const payload = await response.json();
      if (payload.ok === false) throw new Error('API error');
      livePrice = normalisePricePayload(payload);
      elements.sourceState.textContent = '已同步';
      showLivePrice({ apply: true });
      setStatus(elements.priceStatus, '今日金價已更新。', 'ok');
    } catch (error) {
      if (error?.name === 'AbortError') return;
      livePrice = null;
      elements.livePrice.textContent = '—';
      elements.priceTime.textContent = '—';
      elements.sourceState.textContent = '手動輸入';
      setStatus(elements.priceStatus, '暫時未能取得今日金價，可手動輸入售出價。', 'error');
      render();
    } finally {
      if (priceFetchController === controller) priceFetchController = null;
    }
  }

  function replaceOptions(select, options, placeholder) {
    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = placeholder;
    select.replaceChildren(placeholderOption, ...options.map(({ value, label }) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      return option;
    }));
  }

  function clearOverseasResult() {
    elements.goldstarPrice.value = '';
    latestOverseasQuotes = null;
    elements.calculationError.hidden = true;
    elements.feeError.hidden = true;
    elements.negativeFeeWarning.hidden = true;
    updateAuthorizationWarning();
    renderEmptyResults();
  }

  function showStoreTax(store) {
    if (!store) {
      elements.overseasCurrency.value = '';
      elements.overseasTaxDetails.textContent = '請先選擇海外店舖。';
      elements.goldstarPriceLabel.textContent = '金星電視價錢';
      elements.feeAdjustmentLabel.textContent = '額外加減金額';
      setStatus(elements.overseasStatus, '請先選擇海外店舖。', 'warn');
      return;
    }
    elements.overseasCurrency.value = store.currencyCode;
    elements.overseasTaxDetails.textContent = OverseasQuote.taxLines(store)
      .map(({ name, rate }) => `${name}：${OverseasQuote.formatRate(rate)}`)
      .join('\n');
    elements.goldstarPriceLabel.textContent = `金星電視價錢（${store.currencyCode}）`;
    elements.feeAdjustmentLabel.textContent = `額外加減金額（${store.currencyCode}）`;
    setStatus(elements.overseasStatus, `${store.storeCode} 稅率已更新。`, 'ok');
  }

  function populateRegions() {
    if (!RegionConfig) return;
    replaceOptions(
      elements.overseasRegion,
      RegionConfig.getRegions().map(({ regionCode, regionName }) => ({ value: regionCode, label: regionName })),
      '請選擇'
    );
  }

  function handleRegionChange() {
    const stores = RegionConfig?.getStoresByRegion(elements.overseasRegion.value) || [];
    replaceOptions(
      elements.overseasStore,
      stores.map(({ storeCode }) => ({ value: storeCode, label: storeCode })),
      elements.overseasRegion.value ? '請選擇店舖' : '請先選擇國家／地區'
    );
    elements.overseasStore.disabled = stores.length === 0;
    showStoreTax(null);
    clearOverseasResult();
    render();
  }

  function handleStoreChange() {
    const store = RegionConfig?.getStoreConfig(elements.overseasStore.value) || null;
    showStoreTax(store);
    clearOverseasResult();
    render();
  }

  function resetOverseasSelection() {
    elements.overseasRegion.value = '';
    replaceOptions(elements.overseasStore, [], '請先選擇國家／地區');
    elements.overseasStore.disabled = true;
    showStoreTax(null);
  }

  function updateMarketUI() {
    const overseas = isOverseas();
    elements.overseasControls.hidden = !overseas;
    elements.domesticFeeField.hidden = overseas;
    elements.originalFeeField.hidden = !overseas;
    elements.feeDiscountField.hidden = !overseas;
    elements.feeAdjustmentField.hidden = !overseas;
    elements.manualFeeField.hidden = !overseas;
    elements.finalFeeField.hidden = !overseas;
    elements.overseasTaxField.hidden = !overseas;
    elements.priceSection.hidden = overseas;
    elements.domesticCalculationDetails.hidden = overseas;
    elements.overseasCalculationDetails.hidden = !overseas;
    elements.priceUnit.value = 'gram';

    if (overseas) {
      priceFetchController?.abort();
      resetOverseasSelection();
      const feeState = OverseasQuote?.feeStateFromQr(originalFee)
        || { originalFee, discountPercent: '100', adjustmentAmount: '0' };
      elements.originalLaborFee.value = feeState.originalFee === null ? '' : String(feeState.originalFee);
      elements.originalLaborFee.readOnly = feeState.originalFee !== null;
      elements.feeDiscount.value = feeState.discountPercent;
      elements.feeAdjustment.value = feeState.adjustmentAmount;
      elements.manualFeeOverride.checked = false;
      elements.finalLaborFee.value = '';
      elements.finalLaborFee.readOnly = true;
      elements.goldstarPrice.value = '';
      elements.manualFeeStatus.textContent = '按工費折扣及額外加減金額自動計算。';
      render();
      return;
    }

    elements.feeDiscount.value = '100';
    elements.feeAdjustment.value = '0';
    elements.manualFeeOverride.checked = false;
    elements.finalLaborFee.value = '';
    elements.finalLaborFee.readOnly = true;
    elements.goldstarPrice.value = '';
    elements.negativeFeeWarning.hidden = true;
    updateAuthorizationWarning();
    resetOverseasSelection();
    latestOverseasQuotes = null;
    if (livePrice) {
      showLivePrice({ apply: true });
      setStatus(elements.priceStatus, '今日金價已更新。', 'ok');
    } else {
      fetchPrice();
    }
    render();
  }

  function clearItemData() {
    ['itemNo', 'modelNo', 'weight', 'laborFee'].forEach((id) => { elements[id].value = ''; });
    originalFee = null;
    elements.originalLaborFee.value = '';
    elements.originalLaborFee.readOnly = false;
    elements.feeDiscount.value = '100';
    elements.feeAdjustment.value = '0';
    elements.manualFeeOverride.checked = false;
    elements.finalLaborFee.value = '';
    elements.finalLaborFee.readOnly = true;
    elements.goldstarPrice.value = '';
    elements.manualFeeStatus.textContent = '按工費折扣及額外加減金額自動計算。';
    elements.negativeFeeWarning.hidden = true;
    updateAuthorizationWarning();
    elements.itemError.hidden = true;
    elements.feeError.hidden = true;
    elements.calculationError.hidden = true;
    elements.priceUnit.value = 'gram';
    if (isOverseas()) {
      latestOverseasQuotes = null;
    } else {
      showLivePrice({ apply: livePrice !== null });
    }
    setStatus(elements.actionStatus, '');
    renderEmptyResults();
  }

  async function rescan() {
    clearItemData();
    setStatus(elements.scanStatus, '可使用相機掃描或上載 QR Code 圖片。');
    elements.scanSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    await startScanner();
  }

  function buildSummary() {
    const quotes = render();
    if (!quotes) throw new Error('未有完整報價資料。');
    if (isOverseas()) {
      const feeCalculation = getFeeCalculation();
      return OverseasQuote.createOverseasSummary({
        storeCode: elements.overseasStore.value,
        itemNo: elements.itemNo.value,
        modelNo: elements.modelNo.value,
        weightGram: elements.weight.value,
        goldstarPrice: elements.goldstarPrice.value,
        feeCalculation,
        quotes
      });
    }
    const weight = finiteNumber(elements.weight.value);
    const fee = finiteNumber(elements.laborFee.value);
    const price = finiteNumber(elements.sellPrice.value);
    return createSummary({
      itemNo: elements.itemNo.value,
      modelNo: elements.modelNo.value,
      weight,
      fee,
      sellPrice: price,
      unit: elements.priceUnit.value,
      quotes
    });
  }

  async function copySummary() {
    try {
      const summary = buildSummary();
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(summary);
      } else {
        const helper = document.createElement('textarea');
        helper.value = summary;
        helper.setAttribute('readonly', '');
        helper.className = 'visually-hidden';
        document.body.append(helper);
        helper.select();
        const copied = document.execCommand('copy');
        helper.remove();
        if (!copied) throw new Error('COPY_FAILED');
      }
      elements.copyButton.textContent = '已複製';
      setStatus(elements.actionStatus, '報價已複製。', 'ok');
      window.setTimeout(() => { elements.copyButton.textContent = '複製報價'; }, 1200);
    } catch (error) {
      setStatus(elements.actionStatus, error.message === '未有完整報價資料。' ? error.message : '未能自動複製報價。', 'error');
    }
  }

  function updateManualFeeMode() {
    const manual = elements.manualFeeOverride.checked;
    elements.finalLaborFee.readOnly = !manual;
    elements.manualFeeStatus.textContent = manual
      ? '已手動調整'
      : '按工費折扣及額外加減金額自動計算。';
    if (!manual) elements.finalLaborFee.value = '';
    render();
  }

  function bind() {
    ['reader', 'scanSection', 'resultSection', 'startButton', 'stopButton', 'qrFile', 'scanStatus', 'libraryStatus',
      'itemNo', 'modelNo', 'weight', 'laborFee', 'itemError', 'priceUnit', 'sellPrice', 'livePrice',
      'priceTime', 'sourceState', 'priceStatus', 'refreshPrice', 'applyPrice', 'results',
      'calculationError', 'copyButton', 'rescanButton', 'clearButton', 'actionStatus', 'marketGroup',
      'overseasControls', 'overseasRegion', 'overseasStore', 'overseasCurrency', 'overseasTaxDetails',
      'overseasStatus', 'domesticFeeField', 'originalFeeField', 'originalLaborFee', 'feeDiscountField',
      'feeDiscount', 'feeAdjustmentField', 'feeAdjustment', 'feeAdjustmentLabel', 'manualFeeField',
      'manualFeeOverride', 'finalFeeField', 'finalLaborFee', 'manualFeeStatus', 'overseasTaxField',
      'goldstarPrice', 'goldstarPriceLabel', 'negativeFeeWarning', 'authorizationWarning', 'feeError',
      'priceSection', 'domesticCalculationDetails', 'overseasCalculationDetails'
    ].forEach((id) => { elements[id] = $(id); });
    if (Object.values(elements).some((element) => !element)) return;

    elements.startButton.addEventListener('click', startScanner);
    elements.stopButton.addEventListener('click', () => stopScanner({ updateStatus: true }));
    elements.qrFile.addEventListener('change', (event) => scanFile(event.target.files?.[0]));
    elements.refreshPrice.addEventListener('click', fetchPrice);
    elements.applyPrice.addEventListener('click', () => {
      const price = selectedLivePrice();
      if (price !== null) {
        elements.sellPrice.value = price.toFixed(2);
        render();
      }
    });
    elements.priceUnit.addEventListener('change', () => showLivePrice({ apply: livePrice !== null }));
    ['weight', 'laborFee', 'sellPrice'].forEach((id) => elements[id].addEventListener('input', render));
    ['originalLaborFee', 'feeDiscount', 'feeAdjustment', 'finalLaborFee', 'goldstarPrice']
      .forEach((id) => elements[id].addEventListener('input', render));
    elements.manualFeeOverride.addEventListener('change', updateManualFeeMode);
    elements.marketGroup.addEventListener('change', updateMarketUI);
    elements.overseasRegion.addEventListener('change', handleRegionChange);
    elements.overseasStore.addEventListener('change', handleStoreChange);
    elements.copyButton.addEventListener('click', copySummary);
    elements.rescanButton.addEventListener('click', rescan);
    elements.clearButton.addEventListener('click', async () => {
      await stopScanner();
      clearItemData();
      setStatus(elements.actionStatus, '貨品資料已清除。', 'ok');
    });
    window.addEventListener('pagehide', () => {
      priceFetchController?.abort();
      stopScanner();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') stopScanner();
    });
    elements.priceUnit.value = 'gram';
    populateRegions();
    updateMarketUI();
    updateScannerControls();
    renderEmptyResults();
  }

  const api = { parseQrPayload, calculateQuotes, normalisePricePayload, createSummary, GRAMS_PER_TAEL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.LukfookSmartQuote = api;
    window.addEventListener('DOMContentLoaded', bind);
  }
})();
