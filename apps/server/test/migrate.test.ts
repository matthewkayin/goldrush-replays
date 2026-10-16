// Checks the migration runner on throwaway SQL directories, so changes to it
// can't silently skip, repeat or half-apply a migration.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import Database from "better-sqlite3";
import { migrate } from "../src/db/migrate.ts";

function makeSqlDir(t: TestContext, files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "goldrush-migrate-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [name, sql] of Object.entries(files)) {
    writeFileSync(join(dir, name), sql);
  }
  return dir;
}

function userVersion(db: Database.Database): number {
  return db.pragma("user_version", { simple: true }) as number;
}

function tableNames(db: Database.Database): string[] {
  return db
    .prepare<[], { name: string }>(
      "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name",
    )
    .all()
    .map((row) => row.name);
}

test("applies migrations in order and records the version", (t) => {
  const dir = makeSqlDir(t, {
    "002_add_b.sql": "CREATE TABLE b (id INTEGER REFERENCES a(id));",
    "001_add_a.sql": "CREATE TABLE a (id INTEGER PRIMARY KEY);",
    "notes.txt": "not a migration",
  });
  const db = new Database(":memory:");
  migrate(db, dir);
  assert.equal(userVersion(db), 2);
  assert.deepEqual(tableNames(db), ["a", "b"]);
});

test("skips migrations that were already applied", (t) => {
  const db = new Database(":memory:");
  migrate(db, makeSqlDir(t, { "001_a.sql": "CREATE TABLE a (id INTEGER);" }));
  migrate(
    db,
    makeSqlDir(t, {
      "001_a.sql": "CREATE TABLE a (id INTEGER);",
      "002_b.sql": "CREATE TABLE b (id INTEGER);",
    }),
  );
  assert.equal(userVersion(db), 2);
  assert.deepEqual(tableNames(db), ["a", "b"]);
});

test("rolls back a migration that fails partway", (t) => {
  const dir = makeSqlDir(t, {
    "001_a.sql": "CREATE TABLE a (id INTEGER);",
    "002_bad.sql": "CREATE TABLE b (id INTEGER); NOT VALID SQL;",
  });
  const db = new Database(":memory:");
  assert.throws(() => migrate(db, dir));
  assert.equal(userVersion(db), 1);
  assert.deepEqual(tableNames(db), ["a"]);
});

test("rejects a gap in the numbering", (t) => {
  const dir = makeSqlDir(t, {
    "001_a.sql": "CREATE TABLE a (id INTEGER);",
    "003_c.sql": "CREATE TABLE c (id INTEGER);",
  });
  const db = new Database(":memory:");
  assert.throws(() => migrate(db, dir), /no gaps or duplicates/);
  assert.equal(userVersion(db), 0);
});

test("rejects a database newer than the migrations", (t) => {
  const dir = makeSqlDir(t, { "001_a.sql": "CREATE TABLE a (id INTEGER);" });
  const db = new Database(":memory:");
  db.pragma("user_version = 5");
  assert.throws(() => migrate(db, dir), /only goes up to 1/);
});
