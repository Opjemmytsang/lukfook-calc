# 巡舖記錄自動電郵

寄信由獨立 Cloudflare Worker 處理。前端儲存新問題後即嘗試寄信，內容包括分行、記錄時間、問題類別、跟進狀態、問題描述及最多三張 JPEG 附件。編輯已儲存的問題不會另寄電郵。

## 部署

1. 在 Resend 驗證獲授權的寄件網域，取得該網域的寄信 API key。
2. 登入 Wrangler。若前端使用自訂網域，在 `store-visit-mail.toml` 修改 `STORE_VISIT_ORIGIN` 為網站的 HTTPS origin（不含路徑及尾斜線）。
3. 在 repo 根目錄執行以下指令。收到提示後，輸入各項設定。收件人填指定的公司電郵，寄件人填已驗證網域下的電郵。存取金鑰使用隨機值，例如 `openssl rand -hex 32` 的輸出，並保留給獲授權使用者。

   ```sh
   npx wrangler deploy --config worker/store-visit-mail.toml
   npx wrangler secret put RESEND_API_KEY --config worker/store-visit-mail.toml
   npx wrangler secret put STORE_VISIT_ACCESS_KEY --config worker/store-visit-mail.toml
   npx wrangler secret put STORE_VISIT_RECIPIENT --config worker/store-visit-mail.toml
   npx wrangler secret put STORE_VISIT_FROM --config worker/store-visit-mail.toml
   ```

4. 在巡舖頁展開「自動電郵設定」，填 Worker 公開網址（完整網址以 `/send` 結尾）和存取金鑰。設定只留在當前分頁工作階段，關閉分頁後需重新輸入。
5. 使用示例記錄驗證寄出及附件。頁面顯示「寄信服務已受理」表示供應商接受請求，收件結果以信箱為準。

離線、寄信服務未設定或寄送失敗時，問題和相片仍會儲存在瀏覽器，可在記錄按「寄送電郵」。自動寄信使用第一次寄送時的內容，重試時保持相同內容。Resend 的重試去重適用於供應商的 24 小時保留期，較久未確認時可先查閱信箱。
