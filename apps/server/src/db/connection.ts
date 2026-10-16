// Opens the SQLite database shared by the API and the worker, and brings its
// schema up to date.
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { migrate } from "./migrate.ts";

export const DEFAULT_DB_PATH = join(
  import.meta.dirname,
  "../../../../data/goldrush.db",
);
export const SQL_DIR = join(import.meta.dirname, "../../sql");

// `path` may be ":memory:" for tests.
export function openDb(path: string): Database.Database {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  // WAL and a busy timeout let the API and worker processes share the file.
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  migrate(db, SQL_DIR);
  return db;
}
