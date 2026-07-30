# 六福珠寶智能報價工具 DEMO

## 功能

- 手機、iPad 及電腦適用的 PWA 統一入口
- 智能報價頁
- 手機相機掃描及 QR Code 圖片上載
- 前台只顯示貨號、模號、金重及工費／標價
- 同步 Cloudflare Worker 今日飾金售出價
- 金價同步失敗時可手動輸入
- 港澳顯示正價、半工、免工及全單 95 折
- 複製不含隱藏 QR 欄位的報價摘要
- 核心工具頁離線開啟
- 海外使用當地金星電視價錢，顯示正價及全單 95 折
- 海外工費支援百分比、固定加減及手動覆寫

## 本機測試

```sh
node tests/smart-quote.test.js
node tests/overseas-quote.test.js
node tests/common.test.js
node tests/static-audit.js
node tests/service-worker.test.js
```

測試涵蓋安裝提示、QR 欄位驗證、摘要隱藏資料、港澳每克及每両換算、海外 Goldstar 報價、工費調整、三折授權提示、店舖稅率、金價欄位兼容及 service worker 快取策略。

## 注意

- 相機功能需要 HTTPS 及使用者授權。
- QR 掃描使用 `html5-qrcode` CDN；首次載入需要網絡。
- QR 第七欄只按「工費／標價」處理，不會自行判斷欄位性質。
- 款式碼、供應商代碼、編入日期、其他欄位及 QR 原文只在記憶體內解析，不會顯示或加入報價摘要。
- 以上數據只作參考，一切以金星系統數據為準。
