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

尚未設定 Supabase 時，首頁顯示的持股、指數及觀察清單是示意資料。Supabase 連線完成後，使用者建立的美股（USD）與台股（TWD）持股、觀察清單與附件會寫入其私人帳戶；資料列以 RLS 限制每位登入者只能讀取和修改自己的資料。股票即時報價、每日新聞摘要與推薦分析尚未接行情／新聞 API，畫面不會把示意價格當成已驗證報價。`daily_briefs` 資料表已預留每日簡報儲存空間。

附件限制為每檔 15 MB，使用 private Storage bucket，支援 PDF、常見圖片、文字、CSV、DOCX 與 XLSX。
