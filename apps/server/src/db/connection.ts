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
  db.pragma("busy_timeout = 5000");
  useWal(db);
  db.pragma("foreign_keys = ON");
  migrate(db, SQL_DIR);
  return db;
}

// `pnpm dev` starts the API and the worker together, so both may open a new
// database file at once. SQLite can refuse the switch to WAL with
// SQLITE_BUSY straight away, without waiting out the busy timeout, so it's
// retried here for up to as long as that timeout.
function useWal(db: Database.Database): void {
  const giveUpAt = Date.now() + 5000;
  for (;;) {
    try {
      db.pragma("journal_mode = WAL");
      return;
    } catch (error) {
      const busy =
        error instanceof Database.SqliteError && error.code === "SQLITE_BUSY";
      if (!busy || Date.now() > giveUpAt) {
        throw error;
      }
      // A synchronous 10 ms sleep; openDb runs once, at startup.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
}
