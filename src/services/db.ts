import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { migrate } from "./migrations";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const p = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "swim.db");
    if (p !== ":memory:") fs.mkdirSync(path.dirname(p), { recursive: true });
    db = new Database(p);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    migrate(db);
  }
  return db;
}

/** Test helper: drop the singleton so the next getDb() opens a fresh DB. */
export function resetDb() {
  db?.close();
  db = null;
}
