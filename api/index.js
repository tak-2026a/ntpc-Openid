"use strict";

const crypto = require("crypto");
const express = require("express");
const openid = require("openid");
const { createClient } = require("@supabase/supabase-js");
const multer = require("multer");
const XLSX = require("xlsx");

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.set({
    "Cache-Control": "no-store, private",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff"
  });
  next();
});

const NTPC_OPENID_IDENTIFIER = "https://openid.ntpc.edu.tw/";
const SESSION_COOKIE = "ntpc_grade_session";
const SESSION_DAYS = 8;

function getBaseUrl() {
  const deployedUrl = process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : null;
  return (process.env.APP_BASE_URL || deployedUrl || "http://localhost:3000").replace(/\/$/, "");
}

function getSupabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function createRelyingParty() {
  return new openid.RelyingParty(
    getBaseUrl() + "/auth/ntpc/callback",
    null,
    false,
    false,
    [new openid.SimpleRegistration({ fullname: true, country: true, language: true, timezone: true })]
  );
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[character]));
}

function page(title, content) {
  return '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' +
    escapeHtml(title) +
    '</title><style>body{margin:0;min-height:100vh;background:#f4f8fb;color:#17324d;font:16px/1.6 system-ui,sans-serif}main{box-sizing:border-box;width:min(94vw,900px);margin:3rem auto;padding:2.25rem;background:#fff;border-radius:18px;box-shadow:0 14px 38px #17324d1c}h1{margin-top:0}p{color:#52677a}.button{display:inline-block;padding:.7rem 1.2rem;border:0;border-radius:9px;background:#087dbe;color:#fff;text-decoration:none;font-weight:700;cursor:pointer}.button.secondary{background:#e8f1f6;color:#075b8c}.profile,.table{margin:1.25rem 0;border:1px solid #dce8f0;border-radius:10px;overflow:hidden}.profile-row{display:grid;grid-template-columns:7rem 1fr;gap:.75rem;padding:.7rem 1rem;border-bottom:1px solid #dce8f0}.profile-row:last-child{border-bottom:0}.profile-row span{color:#52677a}.table{width:100%;border-collapse:collapse}.table th,.table td{padding:.7rem;text-align:left;border-bottom:1px solid #dce8f0}.table th{background:#f6fafc;color:#52677a}.table tr:last-child td{border-bottom:0}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:1rem}.card{display:block;padding:1.1rem;border:1px solid #dce8f0;border-radius:10px;color:inherit;text-decoration:none}.card:hover{border-color:#087dbe}.note{font-size:.9rem}.error{color:#a21d2b}</style></head><body><main>' +
    content + '</main></body></html>';
}

function parseAuthorization(value) {
  try {
    const items = JSON.parse(value || "[]");
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function profileRows(user) {
  const roles = Array.isArray(user.openid_roles) ? user.openid_roles : [];
  return [
    ["姓名", user.display_name],
    ["身分別", roles.join("、") || "已驗證使用者"]
  ].map(([label, value]) => '<div class="profile-row"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>').join("");
}

function canImportRoster(user) {
  return Array.isArray(user.openid_roles) && user.openid_roles.includes("教師");
}

async function importRoster(workbook, supabase) {
  const schoolYear = String(process.env.SCHOOL_YEAR || "115");
  const totals = { classes: 0, students: 0, enrollments: 0, skipped: 0 };
  for (const sheetName of workbook.SheetNames) {
    const match = sheetName.match(/^(\d)(\d{2})(.*?)(?:\(|$)/);
    if (!match) { totals.skipped += 1; continue; }
    const grade = Number(match[1]);
    const classNumber = Number(match[2]);
    const subject = (match[3] || "未分類").trim();
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", raw: false });
    const { data: classInfo, error: classError } = await supabase.from("classes").upsert({
      school_year: schoolYear, grade, class_number: classNumber, subject, source_sheet: sheetName
    }, { onConflict: "school_year,grade,class_number,subject" }).select("id").single();
    if (classError) throw classError;
    totals.classes += 1;
    for (const row of rows.slice(3)) {
      const seatNumber = Number(row[0]);
      const fullName = String(row[1] || "").trim();
      if (!Number.isInteger(seatNumber) || seatNumber < 1 || !fullName) continue;
      const { data: student, error: studentError } = await supabase.from("students").upsert({
        school_year: schoolYear, grade, class_number: classNumber, seat_number: seatNumber, full_name: fullName
      }, { onConflict: "school_year,grade,class_number,seat_number" }).select("id").single();
      if (studentError) throw studentError;
      totals.students += 1;
      const { error: enrollmentError } = await supabase.from("class_enrollments").upsert({
        class_id: classInfo.id, student_id: student.id
      }, { onConflict: "class_id,student_id" });
      if (enrollmentError) throw enrollmentError;
      totals.enrollments += 1;
    }
  }
  return totals;
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").map((part) => {
    const index = part.indexOf("=");
    return index === -1 ? [] : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))];
  }).filter((pair) => pair.length));
}

function setSessionCookie(res, token) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  res.append("Set-Cookie", SESSION_COOKIE + "=" + encodeURIComponent(token) +
    "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + maxAge);
}

function clearSessionCookie(res) {
  res.append("Set-Cookie", SESSION_COOKIE + "=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
}

async function getCurrentUser(req) {
  const supabase = getSupabase();
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!supabase || !token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const { data: session } = await supabase.from("app_sessions")
    .select("user_id, expires_at").eq("token_hash", tokenHash).maybeSingle();
  if (!session || new Date(session.expires_at) <= new Date()) return null;
  const { data: user } = await supabase.from("app_users")
    .select("id, display_name, openid_roles, student_code").eq("id", session.user_id).maybeSingle();
  return user || null;
}

async function requireUser(req, res) {
  const user = await getCurrentUser(req);
  if (!user) {
    res.redirect(303, "/");
    return null;
  }
  return user;
}

async function hasClassAccess(supabase, userId, classId) {
  const { data } = await supabase.from("teacher_class_access")
    .select("class_id").eq("user_id", userId).eq("class_id", classId).maybeSingle();
  return Boolean(data);
}

app.get("/", async (req, res) => {
  const user = await getCurrentUser(req);
  if (user) return res.redirect(303, "/dashboard");
  res.type("html").send(page("成績瀏覽系統", '<h1>成績瀏覽系統</h1><p>請先使用新北市教育局 OpenID 登入。班級名冊與成績不會在登入前顯示。</p><a class="button" href="/login">使用新北市 OpenID 登入</a>'));
});

app.get("/login", (_req, res) => {
  createRelyingParty().authenticate(NTPC_OPENID_IDENTIFIER, false, (error, authUrl) => {
    if (error || !authUrl) {
      return res.status(502).type("html").send(page("無法登入", '<h1>暫時無法建立登入請求</h1><p class="error">請確認 APP_BASE_URL 是目前公開的 HTTPS 網址。</p>'));
    }
    res.redirect(authUrl);
  });
});

app.all("/auth/ntpc/callback", (req, res) => {
  createRelyingParty().verifyAssertion(req, async (error, result) => {
    const name = result && (result.fullname || result.nickname);
    const identity = result && (result.claimedIdentifier || result.claimed_id || result.identity);
    const supabase = getSupabase();

    if (error || !result || !name || !identity) {
      return res.status(401).type("html").send(page("登入未完成", '<h1>登入未完成</h1><p class="error">OpenID 驗證失敗，或服務端沒有授權回傳必要資料。</p><a class="button" href="/">重新登入</a>'));
    }
    if (!supabase) {
      return res.status(503).type("html").send(page("資料庫尚未設定", '<h1>OpenID 已驗證</h1><p>資料庫尚未設定，因此系統不會建立登入工作階段或顯示學生資料。</p>'));
    }

    try {
      const authorization = parseAuthorization(result.timezone);
      const roles = unique(authorization.map((item) => item.role));
      const studentCode = /^\d{6}$/.test(result.language || "") ? result.language : null;
      const { data: user, error: userError } = await supabase.from("app_users").upsert({
        openid_identity: identity,
        display_name: name,
        openid_roles: roles,
        student_code: studentCode,
        last_login_at: new Date().toISOString()
      }, { onConflict: "openid_identity" }).select().single();
      if (userError) throw userError;

      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
      await supabase.from("app_sessions").delete().lt("expires_at", new Date().toISOString());
      const { error: sessionError } = await supabase.from("app_sessions").insert({
        token_hash: tokenHash, user_id: user.id, expires_at: expiresAt
      });
      if (sessionError) throw sessionError;
      setSessionCookie(res, token);
      res.redirect(303, "/dashboard");
    } catch {
      res.status(500).type("html").send(page("無法建立安全工作階段", '<h1>登入未完成</h1><p class="error">系統無法建立安全工作階段，未顯示任何學生資料。</p>'));
    }
  });
});

app.get("/dashboard", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const supabase = getSupabase();
  const { data, error } = await supabase.from("teacher_class_access")
    .select("class_id, classes(id, school_year, grade, class_number, subject)")
    .eq("user_id", user.id);
  if (error) return res.status(500).type("html").send(page("系統錯誤", '<h1>暫時無法讀取班級</h1>'));

  const cards = (data || []).map((item) => {
    const classInfo = item.classes;
    if (!classInfo) return "";
    return '<a class="card" href="/classes/' + encodeURIComponent(classInfo.id) + '"><strong>' +
      escapeHtml(classInfo.grade + " 年 " + classInfo.class_number + " 班") +
      '</strong><br><span>' + escapeHtml(classInfo.subject) + " · " + escapeHtml(classInfo.school_year) + ' 學年度</span></a>';
  }).join("");
  const empty = cards ? "" : '<p class="note">尚未指派可瀏覽的班級。即使是教師帳號，也必須由系統管理者在私有資料庫逐班授權。</p>';
  res.type("html").send(page("我的班級", '<h1>我的班級</h1><div class="profile">' + profileRows(user) + '</div><div class="cards">' + cards + '</div>' + empty + '<p><a class="button secondary" href="/logout">登出</a></p>'));
});

app.get("/admin/import-roster", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  if (!canImportRoster(user)) return res.status(403).type("html").send(page("沒有權限", '<h1>沒有權限</h1><p>只有教師帳號可匯入名冊。</p>'));
  res.type("html").send(page("匯入班級名冊", '<h1>匯入班級名冊</h1><p>此操作會將 Excel 內的班級、座號與姓名寫入私有資料庫。匯入不會自動授權任何人瀏覽班級。</p><form method="post" action="/admin/import-roster" enctype="multipart/form-data"><p><input type="file" name="roster" accept=".xls,.xlsx" required></p><button class="button" type="submit">匯入名冊</button></form><p><a class="button secondary" href="/dashboard">取消</a></p>'));
});

app.post("/admin/import-roster", upload.single("roster"), async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  if (!canImportRoster(user)) return res.status(403).type("html").send(page("沒有權限", '<h1>沒有權限</h1><p>只有教師帳號可匯入名冊。</p>'));
  const file = req.file;
  if (!file || !/\.xlsx?$/i.test(file.originalname || "")) return res.status(400).type("html").send(page("匯入失敗", '<h1>請選擇 Excel 檔</h1><p class="error">只接受 .xls 或 .xlsx 檔案。</p><a class="button" href="/admin/import-roster">返回</a>'));
  try {
    const workbook = XLSX.read(file.buffer, { type: "buffer" });
    const totals = await importRoster(workbook, getSupabase());
    res.type("html").send(page("匯入完成", '<h1>名冊匯入完成</h1><p>已處理 ' + escapeHtml(totals.classes) + ' 個班級工作表與 ' + escapeHtml(totals.students) + ' 筆學生資料。</p><p>下一步需要逐班設定瀏覽權限，完成前不會在儀表板顯示學生名冊。</p><a class="button" href="/dashboard">回我的班級</a>'));
  } catch {
    res.status(500).type("html").send(page("匯入失敗", '<h1>名冊匯入失敗</h1><p class="error">檔案格式或資料庫寫入發生問題，未顯示任何學生資料。</p><a class="button" href="/admin/import-roster">返回</a>'));
  }
});

app.get("/classes/:classId", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const supabase = getSupabase();
  const classId = req.params.classId;
  if (!await hasClassAccess(supabase, user.id, classId)) {
    return res.status(403).type("html").send(page("沒有權限", '<h1>沒有權限</h1><p>您未獲授權瀏覽此班級。</p><a class="button" href="/dashboard">回我的班級</a>'));
  }

  const [{ data: classInfo }, { data: enrollments, error }] = await Promise.all([
    supabase.from("classes").select("grade, class_number, subject, school_year").eq("id", classId).maybeSingle(),
    supabase.from("class_enrollments").select("students(full_name, seat_number)").eq("class_id", classId)
  ]);
  if (error || !classInfo) return res.status(500).type("html").send(page("系統錯誤", '<h1>暫時無法讀取名冊</h1>'));

  const rows = (enrollments || []).map((item) => item.students).filter(Boolean)
    .sort((a, b) => a.seat_number - b.seat_number)
    .map((student) => '<tr><td>' + escapeHtml(student.seat_number) + '</td><td>' + escapeHtml(student.full_name) + '</td><td>尚未建立評量</td></tr>').join("");
  res.type("html").send(page("班級名冊", '<h1>' + escapeHtml(classInfo.grade + " 年 " + classInfo.class_number + " 班 · " + classInfo.subject) + '</h1><p>目前僅供瀏覽名冊；成績欄尚未開放填寫或顯示。</p><table class="table"><thead><tr><th>座號</th><th>姓名</th><th>成績狀態</th></tr></thead><tbody>' + rows + '</tbody></table><a class="button secondary" href="/dashboard">回我的班級</a>'));
});

app.get("/logout", async (req, res) => {
  const supabase = getSupabase();
  const token = parseCookies(req)[SESSION_COOKIE];
  if (supabase && token && /^[a-f0-9]{64}$/.test(token)) {
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    await supabase.from("app_sessions").delete().eq("token_hash", hash);
  }
  clearSessionCookie(res);
  res.redirect(303, "/");
});

module.exports = app;
