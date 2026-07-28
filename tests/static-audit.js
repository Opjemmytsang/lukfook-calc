'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const pages = ['index.html', 'smart-quote.html', 'main-tool.html', 'discount-scenarios.html', 'profit-estimator-v1.html'];

for (const page of pages) {
  const html = read(page);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, `${page} contains duplicate IDs`);
  for (const match of html.matchAll(/(?:href|src)="(\.\/)?([^"#?]+)"/g)) {
    const target = match[2];
    if (/^(https?:|data:|mailto:|tel:)/.test(target)) continue;
    assert.ok(fs.existsSync(path.join(root, target)), `${page} has missing local resource: ${target}`);
  }
}

const smartHtml = read('smart-quote.html');
const smartJs = read('assets/js/smart-quote.js');
const discountHtml = read('discount-scenarios.html');
for (const forbidden of ['原價', '金價95折半工', '金價95折免工', 'QR 原始內容']) {
  assert.ok(!smartHtml.includes(forbidden), `smart-quote.html contains forbidden text: ${forbidden}`);
  assert.ok(!smartJs.includes(forbidden), `smart-quote.js contains forbidden text: ${forbidden}`);
}
for (const hiddenLabel of ['款式碼', '供應商代碼', '編入日期']) {
  assert.ok(!smartHtml.includes(hiddenLabel), `smart-quote.html displays hidden field: ${hiddenLabel}`);
}
assert.equal((smartJs.match(/label: '/g) || []).length, 4, 'smart quote must define exactly four schemes');
assert.ok(!discountHtml.includes('原價'), 'discount-scenarios.html still contains 原價');
assert.ok(!discountHtml.includes('金價95折'), 'discount-scenarios.html still contains unconfirmed gold-price discount');
assert.ok(pages.every((page) => read(page).includes('以上數據只作參考，一切以金星系統數據為準。')), 'a main page is missing the required disclaimer');

const manifest = JSON.parse(read('manifest.webmanifest'));
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.scope, './');
assert.match(manifest.name, /DEMO/);
for (const icon of manifest.icons) {
  assert.ok(fs.existsSync(path.join(root, icon.src)), `manifest icon missing: ${icon.src}`);
}

console.log('static audit passed');
