# 日常投資簡報

GitHub Pages 靜態網站，Supabase 提供 Email 密碼登入、個人資料庫與私人附件空間。

## 本機預覽

直接開啟 `index.html` 可看示意資料版面。要測試 Supabase 登入及資料存取，請用本機靜態網站伺服器預覽（例如 VS Code Live Server）；瀏覽器直接開檔時，Supabase Email redirect 網址通常不會符合正式設定。

## Supabase 設定

1. 建立 Supabase 專案，在 SQL Editor 執行 `supabase-schema.sql`。
2. 到 Authentication → URL Configuration，將正式 GitHub Pages 網址加到 Site URL 與 Redirect URLs。
3. 開啟 `app.js`，填入專案 Project URL 與 Publishable key。這把瀏覽器公開金鑰會受 Row Level Security 與 Storage policies 限制；**不要填 service role key**。
4. Authentication → Providers 確認 Email provider 已啟用。可依需求關閉 Email confirmation，或設定 SMTP 後保留驗證流程。

## GitHub Pages 部署

推送到 GitHub repo 的 `main` branch 後，GitHub Actions 會部署根目錄的 `index.html`。在 repo 的 Settings → Pages 將 Build and deployment 設為 GitHub Actions。部署完成後，將 Pages 網址加入 Supabase Auth 的允許網址。

## 資料與行情

未登入首頁的持股、指數與觀察清單是示意資料。Supabase 連線後，使用者的美股（USD）、台股（TWD）持股、觀察清單與附件會寫入私人帳戶，並由 RLS 保護。登入後的股票報價透過 Supabase Edge Function `market-quotes` 查詢 Twelve Data；函式要求有效登入，只接受帳號資料庫裡的持股與觀察清單，每次最多 8 檔。市場開盤時每 5 分鐘更新，使用者亦可手動重新整理。沒有報價或 API 設定時，市價顯示為「—」，不會拿平均成本代替。

### 行情 API 設定

1. 在 Twelve Data 建立 API key，並確認所選方案授權你在這個網站顯示報價；免費 Basic 方案標示為內部非展示用途，不應直接用於網站報價展示。
2. 在 Supabase 專案 → Edge Functions → Secrets 新增 `TWELVE_DATA_API_KEY`，貼上 API key。不要將金鑰放進 `app.js`、GitHub 或聊天訊息。
3. Twelve Data Basic 的美股報價可即時，但台股需要該方案實際涵蓋的市場/試用標的；無法取得的代號會顯示未提供。真正即時的台股報價可能需要額外授權。

免費行情額度與授權限制依供應商方案而異。資料延遲與可用性依供應商回傳為準。`daily_briefs` 資料表保留每日簡報儲存空間；新聞摘要與推薦分析尚未串接。

附件限制為每檔 15 MB，使用 private Storage bucket，支援 PDF、常見圖片、文字、CSV、DOCX 與 XLSX。
