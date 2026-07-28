(() => {
  'use strict';

  let installPrompt = null;
  const installButton = document.getElementById('installButton');
  const installStatus = document.getElementById('installStatus');

  function isStandalone() {
    return window.matchMedia?.('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
  }

  function isIOSSafari() {
    const agent = window.navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/i.test(agent)
      || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
    const isSafari = /Safari/i.test(agent) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(agent);
    return isIOS && isSafari;
  }

  function showInstallMessage(message) {
    if (!installStatus) return;
    installStatus.textContent = message;
    installStatus.hidden = false;
  }

  function updateInstallButton() {
    if (!installButton) return;
    installButton.hidden = isStandalone();
  }

  updateInstallButton();

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    updateInstallButton();
  });

  installButton?.addEventListener('click', async () => {
    if (isStandalone()) {
      updateInstallButton();
      return;
    }

    if (installPrompt) {
      const promptEvent = installPrompt;
      installPrompt = null;
      installButton.disabled = true;
      try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice?.outcome === 'accepted') {
          showInstallMessage('正在完成安裝。');
        } else {
          showInstallMessage('尚未安裝，可稍後再試。');
        }
      } catch (error) {
        showInstallMessage('暫時未能開啟安裝提示，可使用瀏覽器選單加入主畫面。');
      } finally {
        installButton.disabled = false;
      }
      return;
    }

    if (isIOSSafari()) {
      showInstallMessage('請按 Safari 的分享按鈕，再選擇『加入主畫面』。');
      return;
    }

    showInstallMessage('此瀏覽器暫不支援直接安裝，可使用瀏覽器選單加入主畫面。');
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    if (installButton) installButton.hidden = true;
    if (installStatus) installStatus.hidden = true;
  });

  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', updateInstallButton);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js', { scope: './' }).catch(() => {
        // 計價功能不依賴 service worker，註冊失敗時仍可繼續使用。
      });
    });
  }
})();
