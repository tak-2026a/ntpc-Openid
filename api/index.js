"use strict";

const express = require("express");
const openid = require("openid");

const app = express();
app.disable("x-powered-by");

const NTPC_OPENID_IDENTIFIER = "https://openid.ntpc.edu.tw/";

function getBaseUrl() {
  // APP_BASE_URL supports a custom domain. VERCEL_URL makes first deployment work
  // without manually entering the generated *.vercel.app address.
  const deployedUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
  return (process.env.APP_BASE_URL || deployedUrl || "http://localhost:3000").replace(/\/$/, "");
}

function createRelyingParty() {
  return new openid.RelyingParty(
    `${getBaseUrl()}/auth/ntpc/callback`,
    null,
    false,
    false,
    [
      new openid.SimpleRegistration({
        fullname: true,
        country: true,
        language: true,
        timezone: true
      })
    ]
  );
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[character]));
}

function parseAuthorization(value) {
  if (!value) return [];

  try {
    const items = JSON.parse(value);
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function formatStudentNumber(language) {
  if (!/^\d{6}$/.test(language || "")) return "未提供";

  const [grade, classNumber, seatNumber] = [
    language.slice(0, 2),
    language.slice(2, 4),
    language.slice(4, 6)
  ].map((part) => String(Number(part)));

  return `${grade} 年 ${classNumber} 班 ${seatNumber} 號`;
}

function page(content) {
  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>新北市 OpenID 登入範例</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f4f8fb; color: #17324d; font: 16px/1.6 system-ui, sans-serif; }
    main { box-sizing: border-box; width: min(92vw, 520px); padding: 2.5rem; text-align: center; background: #fff; border-radius: 18px; box-shadow: 0 14px 38px #17324d1c; }
    h1 { margin-top: 0; font-size: 1.55rem; } p { color: #52677a; }
    .button { display: inline-block; padding: .7rem 1.2rem; border-radius: 9px; background: #087dbe; color: #fff; text-decoration: none; font-weight: 700; }
    .profile { margin: 1.5rem 0; text-align: left; border: 1px solid #dce8f0; border-radius: 10px; overflow: hidden; }
    .profile-row { display: grid; grid-template-columns: 7rem 1fr; gap: .75rem; padding: .75rem 1rem; border-bottom: 1px solid #dce8f0; }
    .profile-row:last-child { border-bottom: 0; }
    .profile-row span { color: #52677a; }
    .profile-row strong { overflow-wrap: anywhere; color: #075b8c; }
    .note { font-size: .9rem; } .error { color: #a21d2b; }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

app.get("/", (_req, res) => {
  res.type("html").send(page(`
    <h1>新北市教育局 OpenID</h1>
    <p>登入後，這個範例只會顯示 OpenID 回傳的中文姓名。</p>
    <a class="button" href="/login">使用新北市 OpenID 登入</a>
  `));
});

app.get("/login", (_req, res) => {
  const relyingParty = createRelyingParty();

  relyingParty.authenticate(NTPC_OPENID_IDENTIFIER, false, (error, authUrl) => {
    if (error || !authUrl) {
      res.status(502).type("html").send(page(`
        <h1>暫時無法建立登入請求</h1>
        <p class="error">請確認 APP_BASE_URL 已設定為目前的公開 HTTPS 網址。</p>
        <a class="button" href="/">回首頁</a>
      `));
      return;
    }
    res.redirect(authUrl);
  });
});

app.all("/auth/ntpc/callback", (req, res) => {
  const relyingParty = createRelyingParty();

  relyingParty.verifyAssertion(req, (error, result) => {
    const name = result && (result.fullname || result.nickname);

    if (error || !result || !name) {
      res.status(401).type("html").send(page(`
        <h1>登入未完成</h1>
        <p class="error">OpenID 驗證失敗，或服務端沒有授權回傳姓名。</p>
        <a class="button" href="/">重新登入</a>
      `));
      return;
    }

    const authorization = parseAuthorization(result.timezone);
    const roles = uniqueValues(authorization.map((item) => item.role));
    const jobGroups = uniqueValues(
      authorization.flatMap((item) => Array.isArray(item.groups) ? item.groups : [])
    );
    const units = uniqueValues([
      result.country,
      ...authorization.map((item) => item.name)
    ]);
    const isStudent = roles.includes("學生");
    const rows = [
      ["單位名稱", units.join("、") || "未提供"],
      ["職務別", jobGroups.join("、") || "未提供"],
      ["身分別", roles.join("、") || "未提供"],
      ...(isStudent ? [["年級座號", formatStudentNumber(result.language)]] : []),
      ["姓名", name]
    ];

    const profile = rows.map(([label, value]) => `
      <div class="profile-row">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    `).join("");

    res.type("html").send(page(`
      <h1>登入成功</h1>
      <div class="profile">${profile}</div>
      <p class="note">此範例不儲存姓名、帳號或其他 OpenID 個資。</p>
      <a class="button" href="/">回首頁</a>
    `));
  });
});

module.exports = app;
