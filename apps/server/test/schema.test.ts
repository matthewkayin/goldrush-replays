// Checks the real migrations in apps/server/sql/ on a fresh in-memory
// database: every table exists, and the constraints the stories rely on hold.
import assert from "node:assert/strict";
import { test } from "node:test";
import type Database from "better-sqlite3";
import { openDb, SQL_DIR } from "../src/db/connection.ts";
import { migrate } from "../src/db/migrate.ts";

function freshDb(): Database.Database {
  return openDb(":memory:");
}

function insertUser(db: Database.Database): number {
  return Number(
    db
      .prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)")
      .run("stew", "hash").lastInsertRowid,
  );
}

function insertReplay(db: Database.Database, userId: number): number {
  return Number(
    db
      .prepare(
        `INSERT INTO replays (uploader_user_id, original_filename, replay_version, map_type)
         VALUES (?, 'test.rep', 0, 'tombstone')`,
      )
      .run(userId).lastInsertRowid,
  );
}

function countRows(db: Database.Database, table: string): number {
  return db
    .prepare<[], { n: number }>(`SELECT count(*) AS n FROM ${table}`)
    .get()!.n;
}

test("creates every table, and migrating again applies nothing", () => {
  const db = freshDb();
  assert.equal(db.pragma("user_version", { simple: true }), 1);
  const tables = db
    .prepare<[], { name: string }>(
      "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name",
    )
    .all()
    .map((row) => row.name);
  assert.deepEqual(tables, [
    "jobs",
    "match_players",
    "replay_analyses",
    "replay_files",
    "replays",
    "sessions",
    "users",
  ]);

  migrate(db, SQL_DIR);
  assert.equal(db.pragma("user_version", { simple: true }), 1);
});

test("usernames are unique case-sensitively", () => {
  const db = freshDb();
  const insert = db.prepare(
    "INSERT INTO users (username, password_hash) VALUES (?, 'hash')",
  );
  insert.run("stew");
  insert.run("Stew");
  assert.throws(() => insert.run("stew"), /UNIQUE/);
});

test("timestamp defaults use the toISOString format", () => {
  const db = freshDb();
  const userId = insertUser(db);
  const { created_at } = db
    .prepare<[number], { created_at: string }>(
      "SELECT created_at FROM users WHERE id = ?",
    )
    .get(userId)!;
  assert.equal(new Date(created_at).toISOString(), created_at);
});

test("rejects rows that point at a missing replay", () => {
  const db = freshDb();
  assert.throws(
    () =>
      db
        .prepare(
          "INSERT INTO match_players (replay_id, slot, name, team, color) VALUES (999, 0, 'stew', 0, 'blue')",
        )
        .run(),
    /FOREIGN KEY/,
  );
});

test("rejects an unknown replay status, and a queued replay with no uploader slot", () => {
  const db = freshDb();
  const replayId = insertReplay(db, insertUser(db));
  assert.throws(
    () =>
      db
        .prepare(
          "UPDATE replays SET status = 'bogus', uploader_slot = 0 WHERE id = ?",
        )
        .run(replayId),
    /CHECK/,
  );
  assert.throws(
    () =>
      db
        .prepare("UPDATE replays SET status = 'queued' WHERE id = ?")
        .run(replayId),
    /CHECK/,
  );
});

test("allows only one queued or running job per replay", () => {
  const db = freshDb();
  const replayId = insertReplay(db, insertUser(db));
  const insertJob = db.prepare("INSERT INTO jobs (replay_id) VALUES (?)");
  const firstJob = insertJob.run(replayId).lastInsertRowid;
  assert.throws(() => insertJob.run(replayId), /UNIQUE/);

  db.prepare("UPDATE jobs SET status = 'done' WHERE id = ?").run(firstJob);
  insertJob.run(replayId);
  assert.equal(countRows(db, "jobs"), 2);
});

test("deleting a replay deletes its file, analysis, jobs and players", () => {
  const db = freshDb();
  const replayId = insertReplay(db, insertUser(db));
  db.prepare("INSERT INTO replay_files (replay_id, data) VALUES (?, ?)").run(
    replayId,
    Buffer.from([1, 2, 3]),
  );
  db.prepare(
    "INSERT INTO replay_analyses (replay_id, analyzer_version, data) VALUES (?, 1, ?)",
  ).run(replayId, Buffer.from([4, 5, 6]));
  db.prepare("INSERT INTO jobs (replay_id) VALUES (?)").run(replayId);
  db.prepare(
    "INSERT INTO match_players (replay_id, slot, name, team, color) VALUES (?, 0, 'stew', 0, 'blue')",
  ).run(replayId);

  db.prepare("DELETE FROM replays WHERE id = ?").run(replayId);
  for (const table of [
    "replay_files",
    "replay_analyses",
    "jobs",
    "match_players",
  ]) {
    assert.equal(countRows(db, table), 0, table);
  }
});
