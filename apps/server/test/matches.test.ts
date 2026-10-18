// Checks the public match endpoints (overview, analysis and download) on
// rows inserted directly, with a saved analyzer output as the analysis, so
// they don't depend on the upload story or the worker.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import type Database from "better-sqlite3";
import {
  analysisSchema,
  apiErrorSchema,
  replaySchema,
  type ReplayStatus,
} from "@goldrush/shared";
import { attachmentDisposition } from "../src/routes/matches.ts";
import { buildTestApp, buildTestAppWithDb } from "./helpers.ts";

const savedAnalysisJson = readFileSync(
  new URL(
    "../../../analyzer/test_replays/test_team.analysis.json",
    import.meta.url,
  ),
  "utf8",
);
const savedAnalysis = analysisSchema.parse(JSON.parse(savedAnalysisJson));
const replayBytes = Buffer.from([0x14, 0x12, 0x59, 0x46, 0x00, 0xff, 0x80]);

// A replay of the saved 2v2 match with its players and file, at `status`,
// uploaded by the one test user (created on first use).
// A processed replay also gets results and the gzipped analysis.
function insertMatch(
  db: Database.Database,
  status: ReplayStatus,
  filename = "test_team.rep",
): number {
  const userId =
    db.prepare<[], { id: number }>("SELECT id FROM users").get()?.id ??
    Number(
      db
        .prepare(
          "INSERT INTO users (username, password_hash) VALUES ('stew', 'hash')",
        )
        .run().lastInsertRowid,
    );
  const processed = status === "processed";
  const replayId = Number(
    db
      .prepare(
        `INSERT INTO replays (uploader_user_id, original_filename, replay_version,
           map_type, uploader_slot, status, error, duration_ticks, uploaded_at,
           processed_at)
         VALUES (?, ?, 0, 'tombstone', ?, ?, ?, ?, '2026-10-17T10:00:00.000Z', ?)`,
      )
      .run(
        userId,
        filename,
        status === "awaiting_player" ? null : 0,
        status,
        status === "failed" ? "Analyzer timed out" : null,
        processed ? savedAnalysis.duration_ticks : null,
        processed ? "2026-10-17T10:01:00.000Z" : null,
      ).lastInsertRowid,
  );
  for (const player of savedAnalysis.players) {
    db.prepare(
      `INSERT INTO match_players (replay_id, slot, name, team, color, result,
         defeated_at_tick)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      replayId,
      player.slot,
      player.name,
      player.team,
      player.color,
      processed ? (player.team === 0 ? "win" : "loss") : null,
      processed ? player.defeated_at_tick : null,
    );
  }
  db.prepare("INSERT INTO replay_files (replay_id, data) VALUES (?, ?)").run(
    replayId,
    replayBytes,
  );
  if (processed) {
    db.prepare(
      "INSERT INTO replay_analyses (replay_id, analyzer_version, data) VALUES (?, 1, ?)",
    ).run(replayId, gzipSync(savedAnalysisJson));
  }
  return replayId;
}

test("the overview answers a processed replay with its results", async (t) => {
  const { app, db } = buildTestAppWithDb(t);
  const id = insertMatch(db, "processed");

  const response = await app.inject({ url: `/api/matches/${id}` });
  assert.equal(response.statusCode, 200);
  const replay = replaySchema.parse(response.json());
  assert.equal(replay.id, id);
  assert.equal(replay.status, "processed");
  assert.equal(replay.uploaderSlot, 0);
  assert.equal(replay.uploaderUsername, "stew");
  assert.equal(replay.durationTicks, savedAnalysis.duration_ticks);
  assert.deepEqual(
    replay.players.map(({ name, team, color, result }) => [
      name,
      team,
      color,
      result,
    ]),
    [
      ["stew", 0, "green", "win"],
      ["Bot", 0, "blue", "win"],
      ["Bot", 1, "red", "loss"],
      ["Bot", 1, "purple", "loss"],
    ],
  );
});

test("the overview answers before processing, with players but no results", async (t) => {
  const { app, db } = buildTestAppWithDb(t);
  for (const status of ["awaiting_player", "queued", "processing"] as const) {
    const id = insertMatch(db, status);
    const response = await app.inject({ url: `/api/matches/${id}` });
    assert.equal(response.statusCode, 200);
    const replay = replaySchema.parse(response.json());
    assert.equal(replay.status, status);
    assert.equal(replay.durationTicks, null);
    assert.equal(replay.players.length, 4);
    assert.ok(replay.players.every((player) => player.result === null));
  }
});

test("the overview of a failed replay has its error", async (t) => {
  const { app, db } = buildTestAppWithDb(t);
  const id = insertMatch(db, "failed");
  const replay = replaySchema.parse(
    (await app.inject({ url: `/api/matches/${id}` })).json(),
  );
  assert.equal(replay.status, "failed");
  assert.equal(replay.error, "Analyzer timed out");
});

test("every match endpoint answers 404 for a replay that doesn't exist", async (t) => {
  const app = buildTestApp(t);
  for (const url of [
    "/api/matches/999",
    "/api/matches/999/analysis",
    "/api/matches/999/replay",
  ]) {
    const response = await app.inject({ url });
    assert.equal(response.statusCode, 404, url);
    assert.deepEqual(response.json(), { message: "Replay not found" });
  }
});

test("a match id that isn't a positive integer is a 400", async (t) => {
  const app = buildTestApp(t);
  const response = await app.inject({ url: "/api/matches/abc" });
  assert.equal(response.statusCode, 400);
  apiErrorSchema.parse(response.json());
});

test("the analysis of a processed replay is the stored analysis, gunzipped", async (t) => {
  const { app, db } = buildTestAppWithDb(t);
  const id = insertMatch(db, "processed");

  const response = await app.inject({ url: `/api/matches/${id}/analysis` });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), JSON.parse(savedAnalysisJson));
});

test("the analysis is 404 'Analysis not ready' until the replay is processed", async (t) => {
  const { app, db } = buildTestAppWithDb(t);
  for (const status of [
    "awaiting_player",
    "queued",
    "processing",
    "failed",
  ] as const) {
    const id = insertMatch(db, status);
    const response = await app.inject({ url: `/api/matches/${id}/analysis` });
    assert.equal(response.statusCode, 404, status);
    assert.deepEqual(response.json(), { message: "Analysis not ready" });
  }
});

test("the download is the original bytes as an attachment with the original filename", async (t) => {
  const { app, db } = buildTestAppWithDb(t);
  const id = insertMatch(db, "queued", "my match.rep");

  const response = await app.inject({ url: `/api/matches/${id}/replay` });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "application/octet-stream");
  assert.equal(
    response.headers["content-disposition"],
    `attachment; filename="my match.rep"; filename*=UTF-8''my%20match.rep`,
  );
  assert.deepEqual(response.rawPayload, replayBytes);
});

test("attachmentDisposition encodes names that aren't plain ASCII", () => {
  assert.equal(
    attachmentDisposition("Pépé's 2v2.rep"),
    `attachment; filename="P_p_'s 2v2.rep"; filename*=UTF-8''P%C3%A9p%C3%A9%27s%202v2.rep`,
  );
  // Quotes, backslashes and line breaks can't break out of the header.
  assert.equal(
    attachmentDisposition('a"b\\c\r\nd.rep'),
    `attachment; filename="a_b_c__d.rep"; filename*=UTF-8''a%22b%5Cc%0D%0Ad.rep`,
  );
});
