'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const pages = ['index.html', 'smart-quote.html', 'main-tool.html', 'discount-scenarios.html', 'profit-estimator-v1.html', 'pricing-tools.html'];

for (const page of pages) {
  const html = read(page);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, `${page} contains duplicate IDs`);
  for (const match of html.matchAll(/(?:href|src)="(\.\/)?([^"#?]+)"/g)) {
    const target = match[2];
    if (/^(https?:|data:|mailto:|tel:)/.test(target)) continue;
    assert.ok(fs.existsSync(path.join(root, target)), `${page} has missing local resource: ${target}`);
  }
  assert.ok(!html.includes('logo.png'), `${page} still displays or references the old page logo`);
  assert.ok(!html.includes('console.error'), `${page} writes an expected fallback to the error console`);
}

const indexHtml = read('index.html');
const smartHtml = read('smart-quote.html');
const smartJs = read('assets/js/smart-quote.js');
const appCss = read('assets/css/app.css');
const commonJs = read('assets/js/common.js');
const discountHtml = read('discount-scenarios.html');
const discountScenarioBlock = discountHtml.match(/const scenarios = \[([\s\S]*?)\n  \];/)?.[1] || '';
for (const forbidden of ['原價', '金價95折半工', '金價95折免工', 'QR 原始內容']) {
  assert.ok(!smartHtml.includes(forbidden), `smart-quote.html contains forbidden text: ${forbidden}`);
  assert.ok(!smartJs.includes(forbidden), `smart-quote.js contains forbidden text: ${forbidden}`);
}
for (const hiddenLabel of ['款式碼', '供應商代碼', '編入日期']) {
  assert.ok(!smartHtml.includes(hiddenLabel), `smart-quote.html displays hidden field: ${hiddenLabel}`);
}
assert.equal((smartJs.match(/label: '/g) || []).length, 4, 'smart quote must define exactly four schemes');
assert.equal((smartJs.match(/DOMContentLoaded/g) || []).length, 1, 'smart quote may bind DOM events more than once');
assert.ok(!smartHtml.includes('capture='), 'image upload must not force the camera');
assert.match(smartHtml, /id="qrFile" type="file" accept="image\/\*"/, 'image upload input is invalid');
assert.match(smartHtml, /id="stopButton"/, 'stop scanning control is missing');
assert.match(smartHtml, /id="marketGroup"/, 'market selector is missing');
assert.match(smartHtml, /id="overseasRegion"/, 'overseas region selector is missing');
assert.match(smartHtml, /id="overseasStore"/, 'overseas store selector is missing');
assert.match(smartHtml, /id="goldstarPrice" type="number"/, 'Goldstar display price input is missing');
assert.match(smartHtml, /請參考當地金星電視價錢/, 'local Goldstar display price hint is missing');
assert.match(smartHtml, /请参考当地金星电视价钱/, 'simplified Chinese Goldstar hint is missing');
assert.match(smartHtml, /Please refer to the local Goldstar display price\./, 'English Goldstar hint is missing');
assert.match(smartHtml, /id="feeDiscount" type="number"[^>]*min="0" max="100"/, 'overseas fee discount input is invalid');
assert.match(smartHtml, /id="feeAdjustment" type="number"/, 'overseas fee adjustment input is missing');
assert.match(smartHtml, /id="manualFeeOverride" type="checkbox"/, 'manual final fee override is missing');
assert.match(smartHtml, /id="finalLaborFee" type="number"[^>]*min="0"/, 'final overseas fee input is invalid');
assert.match(smartHtml, /id="authorizationWarning"/, 'manager authorization warning is missing');
assert.match(smartJs, /elements\.priceSection\.hidden = overseas/, 'Hong Kong price panel must be hidden overseas');
assert.match(appCss, /\[hidden\]\{display:none!important\}/, 'hidden overseas controls may still be rendered');
assert.match(smartHtml, /src="\.\/assets\/js\/region-config\.js"/, 'central region configuration is not loaded');
assert.match(smartHtml, /src="\.\/assets\/js\/overseas-quote\.js"/, 'overseas quote module is not loaded');
assert.match(smartHtml, /<option value="gram">每克<\/option><option value="tael">每両<\/option>/, 'smart quote must default to grams');
assert.equal((indexHtml.match(/class="tool-card"/g) || []).length, 3, 'home page must show exactly three tools');
assert.ok(!indexHtml.includes('profit-estimator-v1.html'), 'profit estimator must be hidden from the home page');
assert.match(indexHtml, /id="installStatus"/, 'install instructions status is missing');
assert.match(commonJs, /請按 Safari 的分享按鈕，再選擇『加入主畫面』。/, 'iOS install instructions are incorrect');
assert.match(commonJs, /此瀏覽器暫不支援直接安裝，可使用瀏覽器選單加入主畫面。/, 'unsupported browser install instructions are incorrect');
assert.match(smartJs, /`\$\{formatMoney\(price\)\}／\$\{unitLabel\}`/, 'live gold price must show its unit');
assert.match(smartJs, /`使用售出價：\$\{formatMoney\(sellPrice\)\}／\$\{unitLabel\}`/, 'copied quote must show price per unit');
assert.equal((discountScenarioBlock.match(/^\s*\['/gm) || []).length, 4, 'discount tool must define exactly four schemes');
assert.ok(!discountHtml.includes('原價'), 'discount-scenarios.html still contains 原價');
assert.ok(!discountHtml.includes('金價95折'), 'discount-scenarios.html still contains unconfirmed gold-price discount');
assert.ok(!discountHtml.includes('localStorage'), 'discount tool must not persist live gold prices');
assert.match(discountHtml, /if\(tael === null && gram !== null\) tael = gram \* 37\.429;/, 'discount tool must derive tael price from gram price');
assert.match(discountHtml, /\$\('unit'\)\.addEventListener\('change'/, 'unit change handler is missing');
assert.ok(pages.every((page) => read(page).includes('以上數據只作參考，一切以金星系統數據為準。')), 'a main page is missing the required disclaimer');
assert.match(read('main-tool.html'), /<option value="克">克<\/option>\s*<option value="両">両<\/option>/, 'main tool must default to grams');
assert.match(discountHtml, /<option value="克">克<\/option><option value="両">両<\/option>/, 'discount tool must default to grams');
assert.match(discountHtml, /textContent=`HK\$ \$\{price\.toLocaleString[\s\S]*\}／\$\{unit\}`/, 'discount live price must show its unit');
assert.match(read('profit-estimator-v1.html'), /<option value="gram">克<\/option>\s*<option value="tael">両<\/option>/, 'profit estimator must default to grams');

const manifest = JSON.parse(read('manifest.webmanifest'));
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.scope, './');
assert.equal(manifest.start_url, './index.html');
assert.match(manifest.name, /DEMO/);
assert.deepEqual(manifest.icons.map(({ sizes }) => sizes), ['192x192', '512x512']);
for (const icon of manifest.icons) {
  assert.ok(fs.existsSync(path.join(root, icon.src)), `manifest icon missing: ${icon.src}`);
}

const serviceWorker = read('service-worker.js');
assert.match(serviceWorker, /lukfook-smart-quote-demo-v7/, 'service worker cache version was not updated');
assert.match(serviceWorker, /\.\/assets\/js\/region-config\.js/, 'region configuration is missing from the app shell');
assert.match(serviceWorker, /\.\/assets\/js\/overseas-quote\.js/, 'overseas quote module is missing from the app shell');
assert.ok(!serviceWorker.includes("'./logo.png'"), 'service worker still pre-caches the removed page logo');
assert.match(serviceWorker, /url\.hostname === 'lukfook-goldprice-proxy\.arwing28\.workers\.dev'[\s\S]*cache: 'no-store'/, 'gold price API must use no-store');
const apiFetchBlock = serviceWorker.match(/if \(url\.hostname === 'lukfook-goldprice-proxy\.arwing28\.workers\.dev'\) \{([\s\S]*?)\n  \}/)?.[1] || '';
assert.ok(!apiFetchBlock.includes('cache.put'), 'gold price API must not be written to cache');

console.log('static audit passed');
