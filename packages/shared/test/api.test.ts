// Covers the parts of the API contracts that the server and web app rely
// on: query and param coercion, the upload result union, and that the
// replay statuses match the database.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  replayHeaderSchema,
  replayIdParamsSchema,
  replayListQuerySchema,
  replayStatusSchema,
  uploadResultSchema,
} from "../src/index.ts";

function readRepoFile(path: string): string {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
}

test("replayListQuerySchema defaults to page 1 and coerces strings", () => {
  assert.equal(replayListQuerySchema.parse({}).page, 1);
  assert.equal(replayListQuerySchema.parse({ page: "2" }).page, 2);
  assert.ok(!replayListQuerySchema.safeParse({ page: "0" }).success);
  assert.ok(!replayListQuerySchema.safeParse({ page: "x" }).success);
});

test("replayIdParamsSchema coerces positive integer ids", () => {
  assert.equal(replayIdParamsSchema.parse({ id: "7" }).id, 7);
  assert.ok(!replayIdParamsSchema.safeParse({ id: "0" }).success);
  assert.ok(!replayIdParamsSchema.safeParse({ id: "abc" }).success);
});

test("uploadResultSchema accepts an accepted upload built from a header", () => {
  const header = replayHeaderSchema.parse(
    JSON.parse(readRepoFile("analyzer/test_replays/test_loss.header.json")),
  );
  const result = uploadResultSchema.safeParse({
    outcome: "accepted",
    filename: "test_loss.rep",
    replay: {
      id: 1,
      filename: "test_loss.rep",
      uploadedAt: new Date().toISOString(),
      processedAt: null,
      mapType: header.map_type,
      replayVersion: header.replay_version,
      durationTicks: null,
      status: "awaiting_player",
      error: null,
      uploaderSlot: null,
      players: header.players.map((player) => ({
        ...player,
        result: null,
        defeatedAtTick: null,
      })),
    },
  });
  assert.ok(result.success, result.error?.message);
});

test("uploadResultSchema requires a reason on a rejected upload", () => {
  const result = uploadResultSchema.safeParse({
    outcome: "rejected",
    filename: "bad.rep",
  });
  assert.ok(!result.success);
});

test("replayStatusSchema matches the replays.status CHECK in 001_init.sql", () => {
  const sql = readRepoFile("apps/server/sql/001_init.sql");
  const check = sql.match(
    /CREATE TABLE replays \([\s\S]*?status\s+TEXT[^\n]*\n\s*CHECK \(status IN \(([^)]*)\)\)/,
  );
  assert.ok(check, "replays.status CHECK not found in 001_init.sql");
  const sqlStatuses = [...check[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(sqlStatuses, replayStatusSchema.options);
});
