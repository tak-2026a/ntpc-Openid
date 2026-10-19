# 新北市教育局 OpenID：僅顯示姓名的範例

這是一個最小化的 Node.js 網站：使用新北市教育局的 **OpenID 2.0** 登入，成功後只呈現服務端回傳的 `openid.sreg.fullname`（中文姓名）。程式不會把姓名、帳號或其他個資寫入資料庫、Cookie 或日誌。

## 本機執行

```bash
npm install
npm start
```

開啟 `http://localhost:3000`。

> 本機測試的回呼網址是 `http://localhost:3000/auth/ntpc/callback`。

## 部署到 Vercel

GitHub Pages 僅能託管靜態檔案，不能在伺服器端驗證 OpenID assertion；因此本專案包含 Vercel 的 Serverless Function 設定。

1. 在 [Vercel](https://vercel.com/new) 匯入此 GitHub repository。
2. 部署完成後，到 Vercel 專案的 **Settings → Environment Variables** 新增：
   - 名稱：`APP_BASE_URL`
   - 值：部署後的完整公開 HTTPS 網址，例如 `https://ntpc-openid.vercel.app`
3. 重新部署一次，開啟該網址並按「使用新北市 OpenID 登入」。

## 串接重點

- 身分提供者識別字：`https://openid.ntpc.edu.tw/`
- 回呼網址：`APP_BASE_URL/auth/ntpc/callback`
- 驗證：必須在伺服器端以 `relyingParty.verifyAssertion(req, ...)` 驗證回傳結果；不可只相信瀏覽器 query string。
- 姓名：`result.fullname`，對應官方資料規格的 `openid.sreg.fullname`。

官方說明指出第三方應用程式不必另行申請核可，且提供 Node.js 範例下載；服務僅限持有新北市教育局校務行政系統合法帳號的使用者。
