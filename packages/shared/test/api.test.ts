// Covers the parts of the API contracts that the server and web app rely
// on: query and param coercion, the list's filters and format, the upload
// result union, and that the replay statuses match the database.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  matchFormat,
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

test("replayListQuerySchema defaults to the public list and parses mine", () => {
  assert.equal(replayListQuerySchema.parse({}).mine, false);
  assert.equal(replayListQuerySchema.parse({ mine: "true" }).mine, true);
  assert.equal(replayListQuerySchema.parse({ mine: "false" }).mine, false);
  assert.ok(!replayListQuerySchema.safeParse({ mine: "maybe" }).success);
});

test("replayListQuerySchema trims text filters and treats empty ones as unset", () => {
  const query = replayListQuerySchema.parse({
    uploader: " Kay ",
    filename: "",
    player: "   ",
  });
  assert.equal(query.uploader, "Kay");
  assert.equal(query.filename, undefined);
  assert.equal(query.player, undefined);
  assert.ok(
    !replayListQuerySchema.safeParse({ uploader: "x".repeat(101) }).success,
  );
});

test("replayListQuerySchema takes the user filter only as a valid username, untrimmed", () => {
  assert.equal(replayListQuerySchema.parse({ user: "Kay" }).user, "Kay");
  assert.equal(replayListQuerySchema.parse({}).user, undefined);
  assert.ok(!replayListQuerySchema.safeParse({ user: " Kay" }).success);
  assert.ok(!replayListQuerySchema.safeParse({ user: "ab" }).success);
});

test("replayListQuerySchema accepts only the four formats", () => {
  assert.equal(replayListQuerySchema.parse({ format: "FFA" }).format, "FFA");
  assert.equal(replayListQuerySchema.parse({}).format, undefined);
  assert.ok(!replayListQuerySchema.safeParse({ format: "ffa" }).success);
});

test("replayListQuerySchema rewrites upload bounds in the stored timestamp format", () => {
  const query = replayListQuerySchema.parse({
    uploadedFrom: "2026-10-02T00:00:00Z",
    uploadedBefore: "2026-10-03T02:00:00+02:00",
  });
  assert.equal(query.uploadedFrom, "2026-10-02T00:00:00.000Z");
  assert.equal(query.uploadedBefore, "2026-10-03T00:00:00.000Z");
  assert.ok(
    !replayListQuerySchema.safeParse({ uploadedFrom: "2026-10-02" }).success,
  );
});

test("matchFormat works the format out from team sizes", () => {
  const teams = (...layout: number[]) => layout.map((team) => ({ team }));
  assert.equal(matchFormat(teams(0, 1)), "1v1");
  assert.equal(matchFormat(teams(0, 0, 1, 1)), "2v2");
  assert.equal(matchFormat(teams(0, 1, 2)), "FFA");
  assert.equal(matchFormat(teams(0, 1, 2, 3)), "FFA");
  assert.equal(matchFormat(teams(0, 0, 1)), "Other");
  assert.equal(matchFormat(teams(0, 0, 0, 1)), "Other");
  assert.equal(matchFormat(teams(0, 0, 1, 2)), "Other");
  assert.equal(matchFormat(teams(0, 0)), "Other");
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
      uploaderUsername: "stew",
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
