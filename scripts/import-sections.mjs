import fs from "fs";
import Database from "better-sqlite3";
import xlsx from "xlsx";

const XLSX_PATH = "./data/dartmouth-sections.xlsx";
const DB_PATH = "./data/clockwise.db";

if (!fs.existsSync(XLSX_PATH)) {
  console.error("Spreadsheet not found at:", XLSX_PATH);
  process.exit(1);
}

const workbook = xlsx.readFile(XLSX_PATH);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });

const db = new Database(DB_PATH);

db.exec(`
DROP TABLE IF EXISTS sections;
CREATE TABLE sections (
  id TEXT PRIMARY KEY,
  subj TEXT,
  num TEXT,
  title TEXT,
  instructor TEXT,
  dist TEXT,
  period_code TEXT,
  period_raw TEXT
);
`);

const insert = db.prepare(`
INSERT INTO sections
(id, subj, num, title, instructor, dist, period_code, period_raw)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

rows.forEach((r, i) => {
  insert.run(
    `${r.Subj}-${r.Num}-${i}`,
    r.Subj,
    r.Num,
    r.Title,
    r.Instructor,
    r.Dist,
    r["Period Code"],
    r.Period
  );
});

console.log(`Imported ${rows.length} sections into ${DB_PATH}`);

db.close();