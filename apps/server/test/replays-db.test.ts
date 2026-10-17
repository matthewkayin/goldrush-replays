// Checks the shared replay reader in db/replays.ts against rows inserted
// directly, so the stories that write replays can rely on how they're read.
import assert from "node:assert/strict";
import { test } from "node:test";
import type Database from "better-sqlite3";
import { openDb } from "../src/db/connection.ts";
import { findReplay, findReplays } from "../src/db/replays.ts";

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
        `INSERT INTO replays (uploader_user_id, original_filename, replay_version, map_type, uploaded_at)
         VALUES (?, 'test.rep', 0, 'tombstone', '2026-10-17T10:00:00.000Z')`,
      )
      .run(userId).lastInsertRowid,
  );
}

function insertPlayer(
  db: Database.Database,
  replayId: number,
  slot: number,
  name: string,
): void {
  db.prepare(
    "INSERT INTO match_players (replay_id, slot, name, team, color) VALUES (?, ?, ?, ?, 'blue')",
  ).run(replayId, slot, name, slot);
}

test("reads a new replay with its players in slot order", () => {
  const db = openDb(":memory:");
  const replayId = insertReplay(db, insertUser(db));
  insertPlayer(db, replayId, 1, "Bot");
  insertPlayer(db, replayId, 0, "stew");

  assert.deepEqual(findReplay(db, replayId), {
    id: replayId,
    filename: "test.rep",
    uploadedAt: "2026-10-17T10:00:00.000Z",
    processedAt: null,
    mapType: "tombstone",
    replayVersion: 0,
    durationTicks: null,
    status: "awaiting_player",
    error: null,
    uploaderSlot: null,
    players: [
      {
        slot: 0,
        name: "stew",
        team: 0,
        color: "blue",
        result: null,
        defeatedAtTick: null,
      },
      {
        slot: 1,
        name: "Bot",
        team: 1,
        color: "blue",
        result: null,
        defeatedAtTick: null,
      },
    ],
  });
});

test("reads a processed replay's results", () => {
  const db = openDb(":memory:");
  const replayId = insertReplay(db, insertUser(db));
  insertPlayer(db, replayId, 0, "stew");
  db.prepare(
    `UPDATE replays SET status = 'processed', uploader_slot = 0,
       duration_ticks = 3600, processed_at = '2026-10-17T10:01:00.000Z'
     WHERE id = ?`,
  ).run(replayId);
  db.prepare(
    "UPDATE match_players SET result = 'loss', defeated_at_tick = 1200 WHERE replay_id = ?",
  ).run(replayId);

  const replay = findReplay(db, replayId);
  assert.ok(replay);
  assert.equal(replay.status, "processed");
  assert.equal(replay.uploaderSlot, 0);
  assert.equal(replay.durationTicks, 3600);
  assert.equal(replay.processedAt, "2026-10-17T10:01:00.000Z");
  assert.equal(replay.players[0]?.result, "loss");
  assert.equal(replay.players[0]?.defeatedAtTick, 1200);
});

test("a missing replay reads as null", () => {
  const db = openDb(":memory:");
  assert.equal(findReplay(db, 999), null);
});

test("reads several replays in the order given, skipping missing ids", () => {
  const db = openDb(":memory:");
  const userId = insertUser(db);
  const first = insertReplay(db, userId);
  const second = insertReplay(db, userId);
  insertPlayer(db, first, 0, "first");
  insertPlayer(db, second, 0, "second");

  const replays = findReplays(db, [second, 999, first]);
  assert.deepEqual(
    replays.map((replay) => [replay.id, replay.players[0]?.name]),
    [
      [second, "second"],
      [first, "first"],
    ],
  );
  assert.deepEqual(findReplays(db, []), []);
});
