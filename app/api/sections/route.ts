import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const limit = Math.min(Number(searchParams.get("limit") || 50), 100);
  const offset = Math.max(Number(searchParams.get("offset") || 0), 0);

  const db = getDb();

  if (!q) {
    const total = (db.prepare(`SELECT COUNT(*) as n FROM sections`).get() as any).n as number;

    const rows = db
      .prepare(
        `SELECT id, subj, num, title, instructor, dist, period_code, period_raw
         FROM sections
         ORDER BY subj, num
         LIMIT ? OFFSET ?`
      )
      .all(limit, offset);

    return NextResponse.json({ total, rows });
  }

  const like = `%${q}%`;

  const total = (
    db
      .prepare(
        `SELECT COUNT(*) as n FROM sections
         WHERE lower(subj) LIKE ?
            OR lower(num) LIKE ?
            OR lower(title) LIKE ?
            OR lower(instructor) LIKE ?
            OR lower(dist) LIKE ?`
      )
      .get(like, like, like, like, like) as any
  ).n as number;

  const rows = db
    .prepare(
      `SELECT id, subj, num, title, instructor, dist, period_code, period_raw
       FROM sections
       WHERE lower(subj) LIKE ?
          OR lower(num) LIKE ?
          OR lower(title) LIKE ?
          OR lower(instructor) LIKE ?
          OR lower(dist) LIKE ?
       ORDER BY subj, num
       LIMIT ? OFFSET ?`
    )
    .all(like, like, like, like, like, limit, offset);

  return NextResponse.json({ total, rows });
}