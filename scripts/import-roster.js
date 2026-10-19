"use strict";

/*
 * Imports roster rows only.  It never writes the source XLS file to GitHub.
 * Usage (PowerShell):
 *   $env:SUPABASE_URL="..."; $env:SUPABASE_SERVICE_ROLE_KEY="..."
 *   $env:SCHOOL_YEAR="115"; node scripts/import-roster.js "C:\\path\\to\\export.xls"
 */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { createClient } = require("@supabase/supabase-js");

const [inputPath] = process.argv.slice(2);
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SCHOOL_YEAR } = process.env;

if (!inputPath || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SCHOOL_YEAR) {
  throw new Error("Provide the XLS path plus SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SCHOOL_YEAR.");
}
if (!fs.existsSync(inputPath)) throw new Error("The XLS file was not found.");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function makeStudentCode(grade, classNumber, seatNumber) {
  return [grade, classNumber, seatNumber].map((part) => String(part).padStart(2, "0")).join("");
}

async function upsert(table, value, onConflict) {
  const { data, error } = await supabase
    .from(table)
    .upsert(value, { onConflict })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function main() {
  const workbook = XLSX.readFile(path.resolve(inputPath), { cellDates: false });
  let classes = 0;
  let rosterRows = 0;

  for (const sheetName of workbook.SheetNames) {
    const match = /^(\d)(\d{2})(.*?)(?:\(|$)/.exec(sheetName);
    if (!match) continue;

    const [, gradeText, classText, subjectText] = match;
    const grade = Number(gradeText);
    const classNumber = Number(classText);
    const subject = subjectText.trim() || "未命名課程";
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: ""
    });

    const classRow = await upsert("classes", {
      school_year: SCHOOL_YEAR,
      grade,
      class_number: classNumber,
      subject,
      source_sheet: sheetName
    }, "school_year,grade,class_number,subject");
    classes += 1;

    // The supplied export has title/header rows 0–2; roster data begins at row 3.
    for (const row of rows.slice(3)) {
      const seatNumber = Number(String(row[0]).trim());
      const fullName = String(row[1]).trim();
      if (!Number.isInteger(seatNumber) || seatNumber < 1 || seatNumber > 99 || !fullName) continue;

      const student = await upsert("students", {
        school_year: SCHOOL_YEAR,
        grade,
        class_number: classNumber,
        seat_number: seatNumber,
        student_code: makeStudentCode(grade, classNumber, seatNumber),
        full_name: fullName
      }, "school_year,grade,class_number,seat_number");

      const { error } = await supabase.from("class_enrollments").upsert({
        class_id: classRow.id,
        student_id: student.id
      }, { onConflict: "class_id,student_id" });
      if (error) throw error;
      rosterRows += 1;
    }
  }

  console.log(JSON.stringify({ importedClasses: classes, importedRosterRows: rosterRows }));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
