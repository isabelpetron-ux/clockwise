import Database from "better-sqlite3";
import path from "path";

let db: Database.Database | null = null;

export function getDb() {
  if (db) return db;

  const dbPath = path.join(process.cwd(), "data", "clockwise.db");
  db = new Database(dbPath);

  return db;
}