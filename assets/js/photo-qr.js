(() => {
  'use strict';
  // Keep photo canvases bounded: phone photos can exceed Safari's canvas limits.
  async function decodePhoto(file) {
    if (typeof window.jsQR !== 'function') throw new Error('照片掃描程式未能載入，請連網重新整理頁面再試。');
    const url = URL.createObjectURL(file);
    const image = new Image();
    const canvas = document.createElement('canvas');
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('讀取照片逾時，請重新選擇照片。')), 15000);
        image.onload = () => { clearTimeout(timer); resolve(); };
        image.onerror = () => { clearTimeout(timer); reject(new Error('未能開啟此照片格式，請改用 JPG、PNG 或螢幕截圖。')); };
        image.src = url;
      });
      const width = image.naturalWidth, height = image.naturalHeight;
      if (!width || !height) throw new Error('照片沒有有效畫面，請重新選擇。');
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('未能處理照片，請重新整理頁面再試。');
      const regions = [{ x: 0, y: 0, width, height }];
      // Overlapping crops preserve small label QR codes within a large photo.
      for (const y of [0, height * 0.4]) for (const x of [0, width * 0.4]) {
        regions.push({ x, y, width: width * 0.6, height: height * 0.6 });
      }
      for (const [index, region] of regions.entries()) {
        for (const limit of (index === 0 ? [1600, 1000, 600] : [1600])) {
          const scale = Math.min(1, limit / Math.max(region.width, region.height));
          canvas.width = Math.max(1, Math.round(region.width * scale));
          canvas.height = Math.max(1, Math.round(region.height * scale));
          context.fillStyle = '#fff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, region.x, region.y, region.width, region.height, 0, 0, canvas.width, canvas.height);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
          const result = window.jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'attemptBoth' });
          if (result) return result.data;
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
      throw new Error('照片內未能辨識 QR Code，請裁剪至貨品 QR Code 附近，或換一張清晰照片。');
    } finally {
      image.onload = image.onerror = null;
      URL.revokeObjectURL(url);
      canvas.width = canvas.height = 0;
    }
  }
  window.LukfookPhotoQr = { decodePhoto };
})();
