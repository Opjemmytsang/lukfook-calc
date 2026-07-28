(() => {
  'use strict';

  const GOLD_PRICE_API = 'https://lukfook-goldprice-proxy.arwing28.workers.dev';
  const GRAMS_PER_TAEL = 37.429;
  const DISCLAIMER = '以上數據只作參考，一切以金星系統數據為準。';
  const SCENARIOS = [
    { key: 'regular', label: '正價', formula: (gold, fee) => gold + fee },
    { key: 'halfFee', label: '半工', formula: (gold, fee) => gold + fee * 0.5 },
    { key: 'noFee', label: '免工', formula: (gold) => gold },
    { key: 'full95', label: '全單 95 折', formula: (gold, fee) => (gold + fee) * 0.95 }
  ];

  const $ = (id) => document.getElementById(id);
  const elements = {};
  let scanner = null;
  let livePrice = null;

  function finiteNumber(value) {
    if (value === '' || value === null || value === undefined) return null;
    const parsed = Number(String(value).replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function positivePrice(value) {
    const parsed = finiteNumber(value);
    return parsed !== null && parsed > 0 ? parsed : null;
  }

  function parseQrPayload(rawValue) {
    const fields = String(rawValue ?? '').trim().split('/');
    if (fields.length < 7) throw new Error('QR Code 資料不完整，請重新掃描。');
    const weight = finiteNumber(fields[2]);
    const fee = finiteNumber(fields[6]);
    if (weight === null || weight <= 0) throw new Error('QR Code 內的金重並非有效數字，請重新掃描。');
    if (fee === null || fee < 0) throw new Error('QR Code 內的工費／標價並非有效數字，請重新掃描。');
    return {
      itemNo: fields[0].trim(),
      modelNo: fields[1].trim(),
      weight,
      fee,
      hidden: {
        styleCode: fields[3] || '',
        supplierCode: fields[4] || '',
        entryDate: fields[5] || '',
        extraFields: fields.slice(7)
      }
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

  function setStatus(element, message, type = '') {
    if (!element) return;
    element.textContent = message;
    element.className = `status${type ? ` is-${type}` : ''}`;
  }

  function renderEmptyResults() {
    if (!elements.results) return;
    elements.results.replaceChildren(...SCENARIOS.map(({ label }) => {
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

  function render() {
    if (!elements.results) return;
    elements.calculationError.hidden = true;
    try {
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
      renderEmptyResults();
      const hasAnyInput = elements.weight.value || elements.laborFee.value || elements.sellPrice.value;
      if (hasAnyInput) {
        elements.calculationError.textContent = error.message;
        elements.calculationError.hidden = false;
      }
      return null;
    }
  }

  function stopScanner({ updateStatus = false } = {}) {
    const current = scanner;
    scanner = null;
    if (!current) return Promise.resolve();
    return current.stop()
      .catch(() => {})
      .then(() => current.clear().catch(() => {}))
      .finally(() => {
        if (updateStatus) setStatus(elements.scanStatus, '掃描已停止。', 'warn');
      });
  }

  function applyScannedData(rawValue) {
    const parsed = parseQrPayload(rawValue);
    elements.itemNo.value = parsed.itemNo;
    elements.modelNo.value = parsed.modelNo;
    elements.weight.value = String(parsed.weight);
    elements.laborFee.value = String(parsed.fee);
    elements.itemError.hidden = true;
    setStatus(elements.scanStatus, '已讀取貨品資料。', 'ok');
    render();
    stopScanner();
    elements.resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function startScanner() {
    if (!window.Html5Qrcode) {
      elements.libraryStatus.hidden = false;
      setStatus(elements.scanStatus, 'QR 掃描功能未能載入，可改為上傳圖片或連接網絡後重試。', 'error');
      return;
    }
    elements.libraryStatus.hidden = true;
    await stopScanner();
    scanner = new window.Html5Qrcode('reader');
    try {
      const boxSize = Math.min(250, Math.max(190, elements.reader.clientWidth - 32));
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: boxSize, height: boxSize } },
        (decodedText) => {
          try {
            applyScannedData(decodedText);
          } catch (error) {
            elements.itemError.textContent = error.message;
            elements.itemError.hidden = false;
            setStatus(elements.scanStatus, error.message, 'error');
          }
        },
        () => {}
      );
      setStatus(elements.scanStatus, '相機已開啟，將 QR Code 放入框內。', 'ok');
    } catch (error) {
      scanner = null;
      setStatus(elements.scanStatus, '未能開啟相機，可改為上傳 QR Code 圖片。', 'error');
    }
  }

  async function scanFile(file) {
    if (!file) return;
    if (!window.Html5Qrcode) {
      setStatus(elements.scanStatus, 'QR 掃描功能未能載入，請連接網絡後重試。', 'error');
      return;
    }
    await stopScanner();
    const fileScanner = new window.Html5Qrcode('reader');
    try {
      const decodedText = await fileScanner.scanFile(file, true);
      applyScannedData(decodedText);
    } catch (error) {
      setStatus(elements.scanStatus, '未能讀取 QR Code，請重新拍攝或上傳另一張圖片。', 'error');
    } finally {
      fileScanner.clear().catch(() => {});
      elements.qrFile.value = '';
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
    const price = selectedLivePrice();
    if (price === null) {
      elements.livePrice.textContent = '—';
      return;
    }
    elements.livePrice.textContent = formatMoney(price);
    elements.priceTime.textContent = livePrice.date || '未提供';
    if (apply || !positivePrice(elements.sellPrice.value)) elements.sellPrice.value = price.toFixed(2);
    render();
  }

  async function fetchPrice() {
    setStatus(elements.priceStatus, '正在讀取今日金價。');
    elements.sourceState.textContent = '連線中';
    try {
      const response = await fetch(GOLD_PRICE_API, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) throw new Error('HTTP error');
      const payload = await response.json();
      if (payload.ok === false) throw new Error('API error');
      livePrice = normalisePricePayload(payload);
      elements.sourceState.textContent = '已同步';
      showLivePrice({ apply: true });
      setStatus(elements.priceStatus, '今日金價已更新。', 'ok');
    } catch (error) {
      livePrice = null;
      elements.livePrice.textContent = '—';
      elements.priceTime.textContent = '—';
      elements.sourceState.textContent = '手動輸入';
      setStatus(elements.priceStatus, '暫時未能取得今日金價，可手動輸入售出價。', 'error');
      render();
    }
  }

  function clearItemData() {
    ['itemNo', 'modelNo', 'weight', 'laborFee'].forEach((id) => { elements[id].value = ''; });
    elements.itemError.hidden = true;
    elements.calculationError.hidden = true;
    setStatus(elements.actionStatus, '');
    renderEmptyResults();
  }

  async function rescan() {
    clearItemData();
    setStatus(elements.scanStatus, '可使用相機掃描或上傳 QR Code 圖片。');
    elements.scanSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    await startScanner();
  }

  function buildSummary() {
    const quotes = render();
    if (!quotes) throw new Error('未有完整報價資料。');
    const weight = finiteNumber(elements.weight.value);
    const fee = finiteNumber(elements.laborFee.value);
    const price = finiteNumber(elements.sellPrice.value);
    const unit = elements.priceUnit.value === 'gram' ? '克' : '両';
    return [
      '六福珠寶智能報價 DEMO',
      '',
      `貨號：${elements.itemNo.value || '-'}`,
      `模號：${elements.modelNo.value || '-'}`,
      `金重：${weight.toLocaleString('zh-HK', { maximumFractionDigits: 3 })} 克`,
      `工費／標價：${formatMoney(fee)}`,
      `使用售出價：${formatMoney(price)} / ${unit}`,
      '',
      ...quotes.map(({ label, amount }) => `${label}：${formatMoney(amount)}`),
      '',
      DISCLAIMER
    ].join('\n');
  }

  async function copySummary() {
    try {
      const summary = buildSummary();
      await navigator.clipboard.writeText(summary);
      elements.copyButton.textContent = '已複製';
      setStatus(elements.actionStatus, '報價已複製。', 'ok');
      window.setTimeout(() => { elements.copyButton.textContent = '複製報價'; }, 1200);
    } catch (error) {
      setStatus(elements.actionStatus, error.message === '未有完整報價資料。' ? error.message : '未能自動複製報價。', 'error');
    }
  }

  function bind() {
    ['reader', 'scanSection', 'resultSection', 'startButton', 'qrFile', 'scanStatus', 'libraryStatus',
      'itemNo', 'modelNo', 'weight', 'laborFee', 'itemError', 'priceUnit', 'sellPrice', 'livePrice',
      'priceTime', 'sourceState', 'priceStatus', 'refreshPrice', 'applyPrice', 'results',
      'calculationError', 'copyButton', 'rescanButton', 'clearButton', 'actionStatus'
    ].forEach((id) => { elements[id] = $(id); });
    if (Object.values(elements).some((element) => !element)) return;

    elements.startButton.addEventListener('click', startScanner);
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
    elements.copyButton.addEventListener('click', copySummary);
    elements.rescanButton.addEventListener('click', rescan);
    elements.clearButton.addEventListener('click', () => {
      clearItemData();
      setStatus(elements.actionStatus, '貨品資料已清除。', 'ok');
    });
    window.addEventListener('pagehide', () => stopScanner());
    renderEmptyResults();
    fetchPrice();
  }

  const api = { parseQrPayload, calculateQuotes, normalisePricePayload, GRAMS_PER_TAEL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.LukfookSmartQuote = api;
    window.addEventListener('DOMContentLoaded', bind);
  }
})();
