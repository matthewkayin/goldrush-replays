// Checks the "Player profiles" story's endpoint, GET /api/users/:username,
// with the real analyzer for uploads.
import assert from "node:assert/strict";
import { test } from "node:test";
import type Database from "better-sqlite3";
import {
  apiErrorSchema,
  profileRecentReplayCount,
  userProfileSchema,
  type MatchResult,
  type Replay,
} from "@goldrush/shared";
import type { App } from "../src/app.ts";
import { buildTestAppWithDb, registerUser } from "./helpers.ts";
import { queueTestReplay, uploadTestReplay } from "./replay-helpers.ts";

function getProfile(app: App, username: string) {
  return app.inject({
    method: "GET",
    url: `/api/users/${encodeURIComponent(username)}`,
  });
}

// Queues test_loss.rep (stew in slot 0 against a bot in slot 1) as the
// uploader's slot 0, then marks it processed with these results and APMs,
// as the worker would.
async function processedReplay(
  app: App,
  db: Database.Database,
  token: string,
  uploader: { result: MatchResult; apm: number },
  opponent: { result: MatchResult; apm: number },
  uploadedAt = new Date().toISOString(),
): Promise<Replay> {
  const replay = await queueTestReplay(app, token, "test_loss.rep", 0);
  db.prepare(
    "UPDATE replays SET status = 'processed', uploaded_at = ? WHERE id = ?",
  ).run(uploadedAt, replay.id);
  const setPlayer = db.prepare(
    "UPDATE match_players SET result = ?, apm = ? WHERE replay_id = ? AND slot = ?",
  );
  setPlayer.run(uploader.result, uploader.apm, replay.id, 0);
  setPlayer.run(opponent.result, opponent.apm, replay.id, 1);
  return replay;
}

test("a profile counts only the user's processed uploads, as the player they chose", async (t) => {
  const { app, db } = buildTestAppWithDb(t);
  const { token } = await registerUser(app, "stew");
  const { token: otherToken } = await registerUser(app, "bread");

  await processedReplay(
    app,
    db,
    token,
    { result: "win", apm: 50 },
    { result: "loss", apm: 999 },
  );
  await processedReplay(
    app,
    db,
    token,
    { result: "loss", apm: 30 },
    { result: "win", apm: 999 },
  );
  await processedReplay(
    app,
    db,
    token,
    { result: "win", apm: 40 },
    { result: "loss", apm: 999 },
  );
  // None of these count: an unprocessed upload, a failed one, and another
  // user's upload with the same in-replay player name.
  await uploadTestReplay(app, token, "test_loss.rep");
  const failed = await queueTestReplay(app, token, "test_loss.rep", 0);
  db.prepare("UPDATE replays SET status = 'failed' WHERE id = ?").run(
    failed.id,
  );
  await processedReplay(
    app,
    db,
    otherToken,
    { result: "win", apm: 999 },
    { result: "loss", apm: 999 },
  );

  // Public: no session cookie.
  const response = await getProfile(app, "stew");
  assert.equal(response.statusCode, 200, response.body);
  const profile = userProfileSchema.parse(response.json());
  assert.equal(profile.username, "stew");
  assert.equal(profile.games, 3);
  assert.equal(profile.wins, 2);
  assert.equal(profile.losses, 1);
  assert.equal(profile.winRate, 2 / 3);
  assert.equal(profile.averageApm, 40);
  assert.ok(
    profile.recentReplays.every(
      (replay) =>
        replay.status === "processed" && replay.uploaderUsername === "stew",
    ),
  );
});

test("a profile with no processed replays has 0 games and no win rate or APM", async (t) => {
  const { app } = buildTestAppWithDb(t);
  const { token } = await registerUser(app, "stew");
  await uploadTestReplay(app, token, "test_loss.rep");

  const response = await getProfile(app, "stew");
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(userProfileSchema.parse(response.json()), {
    username: "stew",
    games: 0,
    wins: 0,
    losses: 0,
    winRate: null,
    averageApm: null,
    recentReplays: [],
  });
});

test("a profile lists only the user's newest processed replays, newest first", async (t) => {
  const { app, db } = buildTestAppWithDb(t);
  const { token } = await registerUser(app, "stew");
  const ids: number[] = [];
  for (let i = 0; i < profileRecentReplayCount + 1; i++) {
    const replay = await processedReplay(
      app,
      db,
      token,
      { result: "win", apm: 10 },
      { result: "loss", apm: 10 },
      new Date(Date.UTC(2026, 9, 1 + i)).toISOString(),
    );
    ids.push(replay.id);
  }

  const profile = userProfileSchema.parse(
    (await getProfile(app, "stew")).json(),
  );
  assert.equal(profile.games, profileRecentReplayCount + 1);
  assert.deepEqual(
    profile.recentReplays.map((replay) => replay.id),
    ids.reverse().slice(0, profileRecentReplayCount),
  );
});

test("an unknown or malformed username is a 404", async (t) => {
  const { app } = buildTestAppWithDb(t);
  await registerUser(app, "Kayin");
  // Usernames are case-sensitive, and a name nobody could register is just
  // another unknown user.
  for (const username of ["nobody", "kayin", "Kay", "a b", "x".repeat(50)]) {
    const response = await getProfile(app, username);
    assert.equal(response.statusCode, 404, username);
    assert.deepEqual(apiErrorSchema.parse(response.json()), {
      message: "User not found",
    });
  }
});
