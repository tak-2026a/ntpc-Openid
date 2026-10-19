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
app.use(express.json({ limit: "100kb" }));
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

// Coordinates reproduce the computer-room layout supplied by the teacher.
// The lecture desk is at the bottom; 17 and 18 are the two special front seats.
const SEAT_TEMPLATE = [
  ["left-13", 14, 16, null], ["left-1", 24, 16, 16], ["left-2", 34, 16, 33], ["left-3", 44, 16, 12],
  ["left-14", 14, 34, null], ["left-4", 24, 34, 15], ["left-5", 34, 34, 31], ["left-6", 44, 34, 11],
  ["left-15", 14, 52, 17], ["left-7", 24, 52, 14], ["left-8", 34, 52, 30], ["left-9", 44, 52, 10],
  ["left-16", 14, 70, 18], ["left-10", 24, 70, 13], ["left-11", 34, 70, 29], ["left-12", 44, 70, 9],
  ["right-1", 56, 16, 28], ["right-2", 66, 16, 8], ["right-3", 76, 16, 34], ["right-4", 86, 16, 4],
  ["right-5", 56, 34, 27], ["right-6", 66, 34, 7], ["right-7", 76, 34, 23], ["right-8", 86, 34, 3],
  ["right-9", 56, 52, 26], ["right-10", 66, 52, 6], ["right-11", 76, 52, 22], ["right-12", 86, 52, 2],
  ["right-13", 56, 70, 25], ["right-14", 66, 70, 5], ["right-15", 76, 70, 21], ["right-16", 86, 70, 1]
];

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
    '</title><style>body{margin:0;min-height:100vh;background:#f4f8fb;color:#17324d;font:16px/1.6 system-ui,sans-serif}main{box-sizing:border-box;width:min(94vw,1100px);margin:3rem auto;padding:2.25rem;background:#fff;border-radius:18px;box-shadow:0 14px 38px #17324d1c}h1{margin-top:0}p{color:#52677a}.button{display:inline-block;padding:.7rem 1.2rem;border:0;border-radius:9px;background:#087dbe;color:#fff;text-decoration:none;font-weight:700;cursor:pointer}.button.secondary{background:#e8f1f6;color:#075b8c}.profile,.table{margin:1.25rem 0;border:1px solid #dce8f0;border-radius:10px;overflow:hidden}.profile-row{display:grid;grid-template-columns:7rem 1fr;gap:.75rem;padding:.7rem 1rem;border-bottom:1px solid #dce8f0}.profile-row:last-child{border-bottom:0}.profile-row span{color:#52677a}.table{width:100%;border-collapse:collapse}.table th,.table td{padding:.7rem;text-align:left;border-bottom:1px solid #dce8f0}.table th{background:#f6fafc;color:#52677a}.table tr:last-child td{border-bottom:0}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:1rem}.card{display:block;padding:1.1rem;border:1px solid #dce8f0;border-radius:10px;color:inherit;text-decoration:none}.card:hover{border-color:#087dbe}.note{font-size:.9rem}.error{color:#a21d2b}.seat-map{position:relative;height:680px;min-width:1000px;margin:1.25rem 0;border:2px solid #17324d;border-radius:14px;overflow:hidden;background:linear-gradient(90deg,#f8fbfd 0 46%,#e6eff5 46% 54%,#f8fbfd 54%)}.seat-map:before{content:"固定電腦座位（拖曳學生卡片交換）";position:absolute;top:12px;left:18px;color:#52677a;font-size:.9rem}.computer-seat{position:absolute;transform:translate(-50%,-50%);width:92px;min-height:70px;border:2px solid #17324d;border-radius:8px;background:#fff;padding:7px;box-sizing:border-box;text-align:center;box-shadow:0 2px 5px #17324d22}.computer-seat.empty{border-style:dashed;color:#778896}.student-card{padding:4px;border-radius:5px;background:#d9edf8;color:#17324d;font-weight:700;font-size:.86rem;line-height:1.25;cursor:grab;user-select:none}.student-number,.student-name{display:block}.student-number{font-size:.78rem;color:#075b8c}.student-card.dragging{opacity:.35}.lecture{position:absolute;bottom:18px;left:50%;transform:translateX(-50%);padding:12px 28px;border:3px solid #17324d;background:#fff;font-weight:700}.cache-zone{position:absolute;left:14px;bottom:18px;width:230px;min-height:85px;padding:10px;border:2px dashed #52677a;border-radius:10px;background:#fffdf5;box-sizing:border-box}.cache-zone strong,.cache-zone span{display:block}.cache-zone span,.cache-empty{font-size:.78rem;color:#52677a}.cache-zone .student-card{display:inline-block;margin:5px 4px 0 0}.map-scroll{overflow:auto}.save-status{min-height:1.6em;color:#075b8c}</style></head><body><main>' +
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

function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
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

function makeStudentCode(grade, classNumber, seatNumber) {
  return [grade, classNumber, seatNumber]
    .map((value) => String(value).padStart(2, "0"))
    .join("");
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
        school_year: schoolYear,
        grade,
        class_number: classNumber,
        seat_number: seatNumber,
        student_code: makeStudentCode(grade, classNumber, seatNumber),
        full_name: fullName
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

async function getOrCreateSeating(supabase, classId) {
  const { data: existing, error: existingError } = await supabase.from("class_seat_assignments")
    .select("seat_key, position_x, position_y, student_id, students(id, full_name, seat_number)")
    .eq("class_id", classId);
  if (existingError) throw existingError;
  const fixedSeatKeys = new Set(SEAT_TEMPLATE.map(([seatKey]) => seatKey));
  if (existing && existing.length === fixedSeatKeys.size && existing.every((seat) => fixedSeatKeys.has(seat.seat_key))) return existing;
  // Older versions allowed free-form positions. Replace that one-time layout
  // with the fixed computer-room grid requested by the teacher.
  if (existing && existing.length) {
    const { error: resetError } = await supabase.from("class_seat_assignments").delete().eq("class_id", classId);
    if (resetError) throw resetError;
  }

  const { data: enrollments, error: enrollmentError } = await supabase.from("class_enrollments")
    .select("student_id, students(id, full_name, seat_number)").eq("class_id", classId);
  if (enrollmentError) throw enrollmentError;

  const students = (enrollments || []).map((item) => item.students).filter(Boolean);
  const bySeatNumber = new Map(students.map((student) => [student.seat_number, student]));
  const specialStudents = new Map();
  // The two front seats are normally 17 and 18. If those seats do not exist
  // in an exported roster, place the highest-numbered students (33, then 34)
  // there as requested, leaving their original computer seats empty.
  [17, 18].forEach((seatNumber, index) => {
    specialStudents.set("left-" + (15 + index),
      bySeatNumber.get(seatNumber) || bySeatNumber.get(33 + index) || null);
  });
  const reservedForFront = new Set([...specialStudents.values()].filter(Boolean).map((student) => student.id));
  const assignments = SEAT_TEMPLATE.map(([seatKey, x, y, preferredSeatNumber]) => {
    const student = specialStudents.has(seatKey)
      ? specialStudents.get(seatKey)
      : (bySeatNumber.get(preferredSeatNumber) || null);
    const usableStudent = student && (!reservedForFront.has(student.id) || specialStudents.has(seatKey)) ? student : null;
    return { class_id: classId, seat_key: seatKey, student_id: usableStudent && usableStudent.id, position_x: x, position_y: y };
  });

  const { error: insertError } = await supabase.from("class_seat_assignments").insert(assignments);
  if (insertError) throw insertError;
  return getOrCreateSeating(supabase, classId);
}

function seatMapMarkup(classId, seats, cachedStudents) {
  const seatByKey = new Map(seats.map((seat) => [seat.seat_key, seat]));
  const fixedSeats = SEAT_TEMPLATE.map(([seatKey, x, y]) => {
    const seat = seatByKey.get(seatKey);
    const student = seat && seat.students;
    const card = student ? '<div class="student-card" draggable="true" data-student-id="' + escapeHtml(student.id) + '"><span class="student-number">' + escapeHtml(student.seat_number + " 號") + '</span><span class="student-name">' + escapeHtml(student.full_name) + '</span></div>' : "";
    return '<div class="computer-seat' + (student ? "" : " empty") + '" data-seat-key="' + escapeHtml(seatKey) + '" data-x="' + x + '" data-y="' + y + '" style="left:' + x + '%;top:' + y + '%">' + card + '</div>';
  }).join("");
  const cache = cachedStudents.map((student) => '<div class="student-card" draggable="true" data-student-id="' + escapeHtml(student.id) + '"><span class="student-number">' + escapeHtml(student.seat_number + " 號") + '</span><span class="student-name">' + escapeHtml(student.full_name) + '</span></div>').join("") || '<span class="cache-empty">暫存區目前沒有學生</span>';
  return '<div class="map-scroll"><div class="seat-map" id="seat-map">' + fixedSeats + '<div class="cache-zone" id="cache-zone"><strong>暫存區</strong><span>未確定位置</span><div id="cache-students">' + cache + '</div></div><div class="lecture">講台</div></div></div>' +
    '<p><button class="button secondary" id="align-seats" type="button">自動對齊</button> <button class="button" id="save-seats" type="button">儲存座位表</button> <a class="button secondary" href="/classes/' + encodeURIComponent(classId) + '/seating">回座位表</a></p><p class="save-status" id="save-status"></p>' +
    '<script>(function(){const map=document.getElementById("seat-map"),cache=document.getElementById("cache-zone"),cacheStudents=document.getElementById("cache-students"),status=document.getElementById("save-status");let dragged=null;function bind(card){card.addEventListener("dragstart",function(){dragged=card;setTimeout(function(){card.classList.add("dragging")},0)});card.addEventListener("dragend",function(){card.classList.remove("dragging");dragged=null})}document.querySelectorAll(".student-card").forEach(bind);function makeEmpty(target){target.classList.add("empty")}function refreshCache(){const hasStudents=cacheStudents.querySelector(".student-card");let empty=cacheStudents.querySelector(".cache-empty");if(!hasStudents&&!empty){empty=document.createElement("span");empty.className="cache-empty";empty.textContent="暫存區目前沒有學生";cacheStudents.appendChild(empty)}if(hasStudents&&empty)empty.remove()}function moveToCache(card){const parent=card.parentElement;cacheStudents.appendChild(card);if(parent.classList.contains("computer-seat"))makeEmpty(parent);refreshCache()}document.querySelectorAll(".computer-seat").forEach(function(seat){seat.addEventListener("dragover",function(event){event.preventDefault()});seat.addEventListener("drop",function(event){event.preventDefault();if(!dragged)return;const current=seat.querySelector(".student-card");const source=dragged.parentElement;if(current&&source.classList.contains("computer-seat")){source.appendChild(current);source.classList.remove("empty")}else if(current){moveToCache(current)}seat.appendChild(dragged);seat.classList.remove("empty");refreshCache()})});cache.addEventListener("dragover",function(event){event.preventDefault()});cache.addEventListener("drop",function(event){event.preventDefault();if(dragged)moveToCache(dragged)});document.getElementById("align-seats").addEventListener("click",function(){status.textContent="已自動對齊：所有電腦座位固定在教室版型中。"});document.getElementById("save-seats").addEventListener("click",async function(){const seats=[...map.querySelectorAll(".computer-seat")].map(function(seat){const student=seat.querySelector(".student-card");return{seat_key:seat.dataset.seatKey,student_id:student?student.dataset.studentId:null}});status.textContent="儲存中…";try{const response=await fetch("/classes/' + encodeURIComponent(classId) + '/seating/edit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({seats:seats})});if(!response.ok)throw new Error();status.textContent="已儲存。暫存區學生尚未分配座位。"}catch(_error){status.textContent="儲存失敗，請重新登入後再試。"}})})()</script>';
}

function attendanceLabel(record) {
  return ({ leave: "事病假", late: "遲到", bonus: "+1 分" })[record.record_type] || "紀錄";
}

function attendanceCardMarkup(student, records) {
  const summary = records.length
    ? records.map((record) => attendanceLabel(record)).join("、")
    : "出席";
  const state = records.length ? " has-record" : " present";
  return '<button class="attendance-card' + state + '" type="button" data-student-id="' + escapeHtml(student.id) + '" data-student-name="' + escapeHtml(student.full_name) + '"><span class="student-number">' + escapeHtml(student.seat_number + " 號") + '</span><span class="student-name">' + escapeHtml(student.full_name) + '</span><span class="attendance-summary">' + escapeHtml(summary) + '</span></button>';
}

function attendanceMapMarkup(classId, seats, cachedStudents, attendanceRecords, recordDate) {
  const byStudentId = new Map();
  for (const record of attendanceRecords) {
    const records = byStudentId.get(record.student_id) || [];
    records.push(record);
    byStudentId.set(record.student_id, records);
  }
  const seatByKey = new Map(seats.map((seat) => [seat.seat_key, seat]));
  const fixedSeats = SEAT_TEMPLATE.map(([seatKey, x, y]) => {
    const seat = seatByKey.get(seatKey);
    const student = seat && seat.students;
    return '<div class="computer-seat' + (student ? "" : " empty") + '" style="left:' + x + '%;top:' + y + '%">' + (student ? attendanceCardMarkup(student, byStudentId.get(student.id) || []) : "") + '</div>';
  }).join("");
  const unassigned = cachedStudents.length
    ? '<section class="unassigned-students"><h2>未排入座位的學生</h2><div>' + cachedStudents.map((student) => attendanceCardMarkup(student, byStudentId.get(student.id) || [])).join("") + '</div></section>'
    : "";
  const recordData = JSON.stringify(attendanceRecords).replace(/</g, "\\u003c");
  return '<style>.attendance-map:before{content:"座位表（點選學生記錄狀況）"}.attendance-card{width:100%;border:0;border-radius:5px;background:#d9edf8;color:#17324d;padding:5px 3px;font:700 .86rem/1.25 system-ui,sans-serif;cursor:pointer}.attendance-card:hover{background:#bfe1f3}.attendance-card.has-record{background:#fff1d6}.attendance-summary{display:block;margin-top:3px;font-size:.7rem;color:#52677a}.attendance-card.has-record .attendance-summary{color:#985400}.unassigned-students{margin:1rem 0;padding:1rem;border:1px solid #dce8f0;border-radius:10px}.unassigned-students h2{font-size:1rem;margin:0 0 .5rem}.unassigned-students .attendance-card{display:inline-block;width:auto;min-width:80px;margin:4px}.unassigned-students .attendance-summary{display:none}.attendance-dialog{width:min(92vw,440px);border:0;border-radius:14px;padding:1.3rem;box-shadow:0 18px 48px #17324d55}.attendance-dialog::backdrop{background:#17324d88}.record-actions{display:flex;gap:.5rem;flex-wrap:wrap;margin:1rem 0}.record-actions button{border:0;border-radius:8px;padding:.55rem .75rem;background:#e8f1f6;color:#075b8c;font-weight:700;cursor:pointer}.record-actions button.selected{background:#087dbe;color:#fff}.reason-input{width:100%;box-sizing:border-box;padding:.65rem;border:1px solid #bfd1de;border-radius:8px;font:inherit}.confirm-record{margin-top:1rem}.confirm-record:disabled{opacity:.5;cursor:not-allowed}.record-history{margin:.8rem 0}.record-row{display:flex;align-items:center;justify-content:space-between;gap:.5rem;padding:.45rem 0;border-bottom:1px solid #dce8f0}.record-row button{border:0;background:none;color:#a21d2b;cursor:pointer}.dialog-close{float:right;border:0;background:none;font-size:1.25rem;cursor:pointer}</style><form class="date-form" id="date-form" method="get"><label>點名日期 <input id="record-date" type="date" name="date" value="' + escapeHtml(recordDate) + '"></label> <button class="button secondary" type="submit">查看紀錄</button></form><div class="map-scroll"><div class="seat-map attendance-map" id="attendance-map">' + fixedSeats + '<div class="lecture">講台</div></div></div>' + unassigned + '<p>預設全數出席。點選學生選擇事病假、遲到或加分，再按確認登記；每次加分固定為 +1 分。</p><p><a class="button secondary" href="/classes/' + encodeURIComponent(classId) + '/records">查看紀錄</a> <a class="button secondary" href="/classes/' + encodeURIComponent(classId) + '/seating/edit">調整座位</a> <a class="button secondary" href="/classes/' + encodeURIComponent(classId) + '">回班級名冊</a></p><dialog class="attendance-dialog" id="attendance-dialog"><button class="dialog-close" type="button" aria-label="關閉">×</button><h2 id="dialog-name"></h2><p id="dialog-seat"></p><div class="record-actions"><button type="button" data-record-type="leave">事病假</button><button type="button" data-record-type="late">遲到</button><button type="button" data-record-type="bonus">加分 +1</button></div><label>理由（可不填）<textarea class="reason-input" id="record-reason" maxlength="500" rows="3"></textarea></label><p><button class="button confirm-record" id="confirm-record" type="button" disabled>確認登記</button></p><div class="record-history" id="record-history"></div></dialog><script id="attendance-record-data" type="application/json">' + recordData + '</script><script>(function(){const dialog=document.getElementById("attendance-dialog"),name=document.getElementById("dialog-name"),seat=document.getElementById("dialog-seat"),reason=document.getElementById("record-reason"),history=document.getElementById("record-history"),confirmButton=document.getElementById("confirm-record"),records=JSON.parse(document.getElementById("attendance-record-data").textContent),date="' + escapeHtml(recordDate) + '",classId="' + encodeURIComponent(classId) + '";let studentId=null,recordType=null;const label={leave:"事病假",late:"遲到",bonus:"加分 +1"};function currentRecords(){return records.filter(function(record){return record.student_id===studentId})}function renderHistory(){history.replaceChildren();const items=currentRecords();if(!items.length){const empty=document.createElement("p");empty.textContent="本日尚無紀錄（預設出席）。";history.appendChild(empty);return}items.forEach(function(record){const row=document.createElement("div");row.className="record-row";const text=document.createElement("span");text.textContent=label[record.record_type]+(record.reason?"："+record.reason:"");const remove=document.createElement("button");remove.type="button";remove.textContent="移除";remove.addEventListener("click",async function(){if(!confirm("確定移除此紀錄？"))return;const response=await fetch("/classes/"+classId+"/attendance/"+record.id,{method:"DELETE"});if(response.ok)location.reload();else alert("移除失敗，請重新登入後再試。")});row.append(text,remove);history.appendChild(row)})}document.getElementById("record-date").addEventListener("change",function(){document.getElementById("date-form").submit()});document.querySelectorAll(".attendance-card").forEach(function(card){card.addEventListener("click",function(){studentId=card.dataset.studentId;recordType=null;name.textContent=card.dataset.studentName;seat.textContent=card.querySelector(".student-number").textContent;reason.value="";confirmButton.disabled=true;document.querySelectorAll("[data-record-type]").forEach(function(button){button.classList.remove("selected")});renderHistory();dialog.showModal()})});document.querySelector(".dialog-close").addEventListener("click",function(){dialog.close()});document.querySelectorAll("[data-record-type]").forEach(function(button){button.addEventListener("click",function(){recordType=button.dataset.recordType;document.querySelectorAll("[data-record-type]").forEach(function(item){item.classList.toggle("selected",item===button)});confirmButton.disabled=false})});confirmButton.addEventListener("click",async function(){if(!studentId||!recordType)return;confirmButton.disabled=true;const response=await fetch("/classes/"+classId+"/attendance",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({student_id:studentId,record_type:recordType,reason:reason.value,record_date:date})});if(response.ok)location.reload();else{confirmButton.disabled=false;alert("儲存失敗，請重新登入後再試。")}})})()</script>';
}

function classRecordsMarkup(classId, records) {
  const rows = records.map((record) => {
    const student = record.students || {};
    const detail = attendanceLabel(record) + (record.reason ? "：" + record.reason : "");
    return '<tr><td>' + escapeHtml(record.record_date) + '</td><td>' + escapeHtml(student.seat_number || "") + '</td><td>' + escapeHtml(student.full_name || "") + '</td><td>' + escapeHtml(detail) + '</td><td><button class="remove-history" type="button" data-record-id="' + escapeHtml(record.id) + '">移除</button></td></tr>';
  }).join("") || '<tr><td colspan="5">尚無紀錄</td></tr>';
  return '<style>.remove-history{border:0;background:none;color:#a21d2b;cursor:pointer;font:inherit}.record-table{font-size:.92rem}</style><p>本頁列出本班目前已建立的全部出缺勤與加分紀錄；可逐筆移除後修正。</p><table class="table record-table"><thead><tr><th>日期</th><th>座號</th><th>姓名</th><th>發生狀況</th><th>操作</th></tr></thead><tbody>' + rows + '</tbody></table><p><a class="button secondary" href="/classes/' + encodeURIComponent(classId) + '/seating">回座位表</a> <a class="button secondary" href="/classes/' + encodeURIComponent(classId) + '">回班級名冊</a></p><script>(function(){document.querySelectorAll(".remove-history").forEach(function(button){button.addEventListener("click",async function(){if(!confirm("確定移除此紀錄？"))return;const response=await fetch("/classes/' + encodeURIComponent(classId) + '/attendance/"+button.dataset.recordId,{method:"DELETE"});if(response.ok)location.reload();else alert("移除失敗，請重新登入後再試。")})})})()</script>';
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
    } catch (error) {
      console.error("OpenID session setup failed:", error);
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
  res.type("html").send(page("班級名冊", '<h1>' + escapeHtml(classInfo.grade + " 年 " + classInfo.class_number + " 班 · " + classInfo.subject) + '</h1><p>目前僅供瀏覽名冊；成績欄尚未開放填寫或顯示。</p><p><a class="button" href="/classes/' + encodeURIComponent(classId) + '/seating">座位表</a> <a class="button secondary" href="/classes/' + encodeURIComponent(classId) + '/records">查看紀錄</a></p><table class="table"><thead><tr><th>座號</th><th>姓名</th><th>成績狀態</th></tr></thead><tbody>' + rows + '</tbody></table><a class="button secondary" href="/dashboard">回我的班級</a>'));
});

app.get("/classes/:classId/records", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const supabase = getSupabase();
  const classId = req.params.classId;
  if (!await hasClassAccess(supabase, user.id, classId)) {
    return res.status(403).type("html").send(page("沒有權限", '<h1>沒有權限</h1><p>您未獲授權瀏覽此班級。</p>'));
  }
  const [{ data: classInfo }, { data: records, error }] = await Promise.all([
    supabase.from("classes").select("grade, class_number, subject").eq("id", classId).maybeSingle(),
    supabase.from("student_attendance_records").select("id, record_date, record_type, reason, students(seat_number, full_name)").eq("class_id", classId).order("record_date", { ascending: false }).order("created_at", { ascending: false })
  ]);
  if (error || !classInfo) return res.status(500).type("html").send(page("暫時無法讀取紀錄", '<h1>暫時無法讀取紀錄</h1><p>請確認已執行 attendance.sql。</p>'));
  res.type("html").send(page("班級紀錄", '<h1>' + escapeHtml(classInfo.grade + " 年 " + classInfo.class_number + " 班 · 查看紀錄") + '</h1>' + classRecordsMarkup(classId, records || [])));
});

app.get("/classes/:classId/seating", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const supabase = getSupabase();
  const classId = req.params.classId;
  const recordDate = isIsoDate(req.query.date) ? req.query.date : new Date().toISOString().slice(0, 10);
  if (!await hasClassAccess(supabase, user.id, classId)) {
    return res.status(403).type("html").send(page("沒有權限", '<h1>沒有權限</h1><p>您未獲授權瀏覽此班級。</p>'));
  }
  try {
    const [{ data: classInfo }, seats, { data: enrollments, error: enrollmentError }, { data: attendanceRecords, error: attendanceError }] = await Promise.all([
      supabase.from("classes").select("grade, class_number, subject").eq("id", classId).maybeSingle(),
      getOrCreateSeating(supabase, classId),
      supabase.from("class_enrollments").select("students(id, full_name, seat_number)").eq("class_id", classId),
      supabase.from("student_attendance_records").select("id, student_id, record_type, reason, points, record_date, created_at").eq("class_id", classId).eq("record_date", recordDate).order("created_at")
    ]);
    if (!classInfo || enrollmentError || attendanceError) throw new Error("Class or attendance data missing");
    const assignedIds = new Set(seats.map((seat) => seat.student_id).filter(Boolean));
    const cachedStudents = (enrollments || []).map((item) => item.students).filter(Boolean)
      .filter((student) => !assignedIds.has(student.id))
      .sort((a, b) => a.seat_number - b.seat_number);
    res.type("html").send(page("座位表與點名", '<h1>' + escapeHtml(classInfo.grade + " 年 " + classInfo.class_number + " 班 · 座位表與點名") + '</h1>' + attendanceMapMarkup(classId, seats, cachedStudents, attendanceRecords || [], recordDate)));
  } catch (error) {
    console.error("Attendance map read failed:", error);
    res.status(500).type("html").send(page("暫時無法讀取座位表", '<h1>暫時無法讀取座位表</h1><p>請先在 Supabase SQL Editor 執行 attendance.sql。</p>'));
  }
});

app.post("/classes/:classId/attendance", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const supabase = getSupabase();
  const classId = req.params.classId;
  if (!await hasClassAccess(supabase, user.id, classId)) return res.status(403).json({ error: "forbidden" });
  const { student_id: studentId, record_type: recordType, record_date: recordDate } = req.body || {};
  const reason = typeof (req.body && req.body.reason) === "string" ? req.body.reason.trim() : "";
  if (typeof studentId !== "string" || !["leave", "late", "bonus"].includes(recordType) || !isIsoDate(recordDate) || reason.length > 500) {
    return res.status(400).json({ error: "invalid_record" });
  }
  const { data: enrollment, error: enrollmentError } = await supabase.from("class_enrollments")
    .select("student_id").eq("class_id", classId).eq("student_id", studentId).maybeSingle();
  if (enrollmentError || !enrollment) return res.status(400).json({ error: "student_not_in_class" });
  const { error: insertError } = await supabase.from("student_attendance_records").insert({
    class_id: classId, student_id: studentId, record_date: recordDate, record_type: recordType,
    reason: reason || null, points: recordType === "bonus" ? 1 : 0, created_by: user.id
  });
  if (insertError) return res.status(500).json({ error: "database_error" });
  res.json({ ok: true });
});

app.delete("/classes/:classId/attendance/:recordId", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const supabase = getSupabase();
  const classId = req.params.classId;
  if (!await hasClassAccess(supabase, user.id, classId)) return res.status(403).json({ error: "forbidden" });
  const { data: record, error: recordError } = await supabase.from("student_attendance_records")
    .select("id").eq("id", req.params.recordId).eq("class_id", classId).maybeSingle();
  if (recordError || !record) return res.status(404).json({ error: "record_not_found" });
  const { error: deleteError } = await supabase.from("student_attendance_records").delete().eq("id", record.id);
  if (deleteError) return res.status(500).json({ error: "database_error" });
  res.json({ ok: true });
});

app.get("/classes/:classId/seating/edit", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const supabase = getSupabase();
  const classId = req.params.classId;
  if (!await hasClassAccess(supabase, user.id, classId)) {
    return res.status(403).type("html").send(page("沒有權限", '<h1>沒有權限</h1><p>您未獲授權瀏覽此班級。</p>'));
  }
  try {
    const [{ data: classInfo }, seats, { data: enrollments, error: enrollmentError }] = await Promise.all([
      supabase.from("classes").select("grade, class_number, subject").eq("id", classId).maybeSingle(),
      getOrCreateSeating(supabase, classId),
      supabase.from("class_enrollments").select("students(id, full_name, seat_number)").eq("class_id", classId)
    ]);
    if (!classInfo || enrollmentError) throw new Error("Class missing");
    const assignedIds = new Set(seats.map((seat) => seat.student_id).filter(Boolean));
    const cachedStudents = (enrollments || []).map((item) => item.students).filter(Boolean)
      .filter((student) => !assignedIds.has(student.id))
      .sort((a, b) => a.seat_number - b.seat_number);
    res.type("html").send(page("班級座位", '<h1>' + escapeHtml(classInfo.grade + " 年 " + classInfo.class_number + " 班 · 座位表") + '</h1><p>電腦座位位置固定。拖曳學生卡片到另一台電腦可交換；尚未排入的學生留在講台左側暫存區。</p>' + seatMapMarkup(classId, seats, cachedStudents)));
  } catch (error) {
    console.error("Seat map read failed:", error);
    res.status(500).type("html").send(page("暫時無法讀取座位表", '<h1>暫時無法讀取座位表</h1><p>請確認資料庫已執行 seating.sql。</p>'));
  }
});

app.post("/classes/:classId/seating/edit", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const supabase = getSupabase();
  const classId = req.params.classId;
  if (!await hasClassAccess(supabase, user.id, classId)) return res.status(403).json({ error: "forbidden" });
  const seats = Array.isArray(req.body && req.body.seats) ? req.body.seats : [];
  if (seats.length !== SEAT_TEMPLATE.length) return res.status(400).json({ error: "invalid_seats" });
  const templateByKey = new Map(SEAT_TEMPLATE.map(([seatKey, x, y]) => [seatKey, { x, y }]));
  const seenKeys = new Set();
  const studentIds = new Set();
  const records = [];
  for (const seat of seats) {
    if (!seat || typeof seat.seat_key !== "string" || !templateByKey.has(seat.seat_key) || seenKeys.has(seat.seat_key)) return res.status(400).json({ error: "invalid_seat" });
    if (seat.student_id && (typeof seat.student_id !== "string" || studentIds.has(seat.student_id))) return res.status(400).json({ error: "duplicate_student" });
    seenKeys.add(seat.seat_key);
    if (seat.student_id) studentIds.add(seat.student_id);
    const position = templateByKey.get(seat.seat_key);
    records.push({ class_id: classId, seat_key: seat.seat_key, student_id: seat.student_id || null, position_x: position.x, position_y: position.y, updated_at: new Date().toISOString() });
  }
  const { data: enrolled, error: enrolledError } = await supabase.from("class_enrollments").select("student_id").eq("class_id", classId);
  if (enrolledError) return res.status(500).json({ error: "database_error" });
  const allowedIds = new Set((enrolled || []).map((item) => item.student_id));
  if ([...studentIds].some((id) => !allowedIds.has(id))) return res.status(400).json({ error: "student_not_in_class" });
  const { error: deleteError } = await supabase.from("class_seat_assignments").delete().eq("class_id", classId);
  if (deleteError) return res.status(500).json({ error: "database_error" });
  const { error: insertError } = await supabase.from("class_seat_assignments").insert(records);
  if (insertError) return res.status(500).json({ error: "database_error" });
  res.json({ ok: true });
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
