'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('assets/js/common.js', 'utf8');

function createHarness({ userAgent = 'Desktop Browser', platform = 'Linux', touchPoints = 0, standalone = false } = {}) {
  const listeners = {};
  const buttonListeners = {};
  const status = { hidden: true, textContent: '' };
  const button = {
    hidden: true,
    disabled: false,
    addEventListener(name, handler) { buttonListeners[name] = handler; }
  };
  const media = {
    matches: standalone,
    addEventListener(name, handler) { listeners[`media:${name}`] = handler; }
  };
  const registrations = [];
  const context = {
    document: {
      getElementById(id) {
        return id === 'installButton' ? button : (id === 'installStatus' ? status : null);
      }
    },
    navigator: {
      userAgent,
      platform,
      maxTouchPoints: touchPoints,
      standalone,
      serviceWorker: {
        async register(path, options) {
          registrations.push({ path, options });
        }
      }
    },
    window: {
      navigator: {
        userAgent,
        platform,
        maxTouchPoints: touchPoints,
        standalone
      },
      matchMedia() { return media; },
      addEventListener(name, handler) { listeners[name] = handler; }
    },
    Promise
  };
  vm.runInNewContext(source, context, { filename: 'common.js' });
  return { button, status, listeners, buttonListeners, registrations };
}

(async () => {
  const ios = createHarness({
    userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
    platform: 'iPhone'
  });
  assert.equal(ios.button.hidden, false);
  await ios.buttonListeners.click();
  assert.equal(ios.status.textContent, '請按 Safari 的分享按鈕，再選擇『加入主畫面』。');

  const android = createHarness({ userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/126 Mobile Safari/537.36' });
  let prompted = false;
  android.listeners.beforeinstallprompt({
    preventDefault() {},
    async prompt() { prompted = true; },
    userChoice: Promise.resolve({ outcome: 'accepted' })
  });
  await android.buttonListeners.click();
  assert.equal(prompted, true);
  assert.equal(android.status.textContent, '正在完成安裝。');

  const unsupported = createHarness();
  await unsupported.buttonListeners.click();
  assert.equal(unsupported.status.textContent, '此瀏覽器暫不支援直接安裝，可使用瀏覽器選單加入主畫面。');

  const installed = createHarness({ standalone: true });
  assert.equal(installed.button.hidden, true);

  const serviceWorker = createHarness();
  await serviceWorker.listeners.load();
  assert.equal(serviceWorker.registrations[0].path, './service-worker.js');
  assert.equal(serviceWorker.registrations[0].options.scope, './');

  console.log('common install tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
