// Checks the "Upload a replay and say which player I was" story and the
// replay list through the HTTP API, with the real analyzer.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  apiErrorSchema,
  maxReplayFileBytes,
  replayPageSchema,
  replayPageSize,
  replaySchema,
  uploadResponseSchema,
} from "@goldrush/shared";
import type { App } from "../src/app.ts";
import { buildTestApp, buildTestAppWithDb, registerUser } from "./helpers.ts";
import {
  choosePlayer,
  postReplays,
  readTestReplay,
  uploadTestReplay,
} from "./replay-helpers.ts";

function listReplays(app: App, token: string | undefined, query = "") {
  return app.inject({
    method: "GET",
    url: `/api/replays${query}`,
    cookies: token === undefined ? {} : { session: token },
  });
}

test("an uploaded replay is stored awaiting a player, with its players", async (t) => {
  const { app, db } = buildTestAppWithDb(t);
  const { user, token } = await registerUser(app);
  const data = readTestReplay("test_loss.rep");

  const response = await postReplays(app, token, [
    { filename: "my game.rep", data },
  ]);
  assert.equal(response.statusCode, 200, response.body);
  const [result] = uploadResponseSchema.parse(response.json()).files;
  assert.ok(result?.outcome === "accepted");
  assert.equal(result.filename, "my game.rep");
  const { replay } = result;
  assert.equal(replay.filename, "my game.rep");
  assert.equal(replay.status, "awaiting_player");
  assert.equal(replay.mapType, "tombstone");
  assert.equal(replay.replayVersion, 0);
  assert.equal(replay.uploaderSlot, null);
  assert.deepEqual(replay.players, [
    {
      slot: 0,
      name: "stew",
      team: 0,
      color: "green",
      result: null,
      defeatedAtTick: null,
    },
    {
      slot: 1,
      name: "Bot",
      team: 1,
      color: "red",
      result: null,
      defeatedAtTick: null,
    },
  ]);

  const stored = db
    .prepare<[number], { uploaderUserId: number; data: Buffer }>(
      `SELECT uploader_user_id AS uploaderUserId, data
       FROM replays JOIN replay_files ON replay_files.replay_id = replays.id
       WHERE replays.id = ?`,
    )
    .get(replay.id);
  assert.equal(stored?.uploaderUserId, user.id);
  assert.ok(stored.data.equals(data), "the stored bytes are the uploaded file");
  const { jobs } = db
    .prepare<[], { jobs: number }>("SELECT count(*) AS jobs FROM jobs")
    .get()!;
  assert.equal(jobs, 0, "no job is queued until the player is chosen");
});

test("every invalid file is rejected with a reason and the valid ones are still accepted, in upload order", async (t) => {
  const { app, db } = buildTestAppWithDb(t);
  const { token } = await registerUser(app);
  const tooLarge = Buffer.concat([
    readTestReplay("test_loss.rep"),
    Buffer.alloc(maxReplayFileBytes),
  ]);

  const response = await postReplays(app, token, [
    { filename: "bad.rep", data: readTestReplay("invalid/bad_signature.rep") },
    { filename: "ffa.rep", data: readTestReplay("test_ffa.rep") },
    { filename: "big.rep", data: tooLarge },
    {
      filename: "future.rep",
      data: readTestReplay("invalid/unknown_version.rep"),
    },
    {
      filename: "cut.rep",
      data: readTestReplay("invalid/truncated_entries.rep"),
    },
    { filename: "team.rep", data: readTestReplay("test_team.rep") },
  ]);
  assert.equal(response.statusCode, 200, response.body);
  const { files } = uploadResponseSchema.parse(response.json());
  assert.deepEqual(
    files.map((file) => [
      file.filename,
      file.outcome === "accepted" ? file.replay.players.length : file.reason,
    ]),
    [
      ["bad.rep", "Not a Gold Rush replay (bad signature)."],
      ["ffa.rep", 4],
      ["big.rep", "The file is larger than 5 MB."],
      ["future.rep", "Unsupported replay version 1."],
      ["cut.rep", "Replay file is truncated."],
      ["team.rep", 4],
    ],
  );

  const { replays } = db
    .prepare<[], { replays: number }>("SELECT count(*) AS replays FROM replays")
    .get()!;
  assert.equal(replays, 2, "only the valid files are stored");
});

test("a file of exactly the size limit isn't rejected for its size", async (t) => {
  const app = buildTestApp(t);
  const { token } = await registerUser(app);
  const replay = readTestReplay("test_loss.rep");
  const atLimit = Buffer.concat([
    replay,
    Buffer.alloc(maxReplayFileBytes - replay.length),
  ]);

  const response = await postReplays(app, token, [
    { filename: "padded.rep", data: atLimit },
  ]);
  // The padding makes it an invalid replay, but the analyzer gets to say so.
  const [result] = uploadResponseSchema.parse(response.json()).files;
  assert.ok(result);
  assert.ok(
    result.outcome === "accepted" ||
      result.reason !== "The file is larger than 5 MB.",
    response.body,
  );
});

test("an upload where every file is rejected still answers 200", async (t) => {
  const app = buildTestApp(t);
  const { token } = await registerUser(app);
  const response = await postReplays(app, token, [
    { filename: "empty.rep", data: Buffer.alloc(0) },
  ]);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    files: [
      {
        outcome: "rejected",
        filename: "empty.rep",
        reason: "Replay file is truncated.",
      },
    ],
  });
});

test("an upload with no files is a 400", async (t) => {
  const app = buildTestApp(t);
  const { token } = await registerUser(app);

  const emptyForm = await postReplays(app, token, []);
  assert.equal(emptyForm.statusCode, 400);
  assert.deepEqual(emptyForm.json(), { message: "No files were uploaded." });

  // Files under another field name are ignored.
  const wrongField = await postReplays(app, token, [
    {
      filename: "test_loss.rep",
      data: readTestReplay("test_loss.rep"),
      field: "file",
    },
  ]);
  assert.equal(wrongField.statusCode, 400);

  const notMultipart = await app.inject({
    method: "POST",
    url: "/api/replays",
    payload: { files: [] },
    cookies: { session: token },
  });
  assert.equal(notMultipart.statusCode, 400);
  apiErrorSchema.parse(notMultipart.json());
});

test("a visitor can't upload, choose a player or list replays", async (t) => {
  const app = buildTestApp(t);
  const signIn = { message: "Sign in required" };

  const upload = await postReplays(app, undefined, [
    { filename: "test_loss.rep", data: readTestReplay("test_loss.rep") },
  ]);
  assert.equal(upload.statusCode, 401);
  assert.deepEqual(upload.json(), signIn);

  const choose = await choosePlayer(app, undefined, 1, 0);
  assert.equal(choose.statusCode, 401);
  assert.deepEqual(choose.json(), signIn);

  const list = await listReplays(app, undefined);
  assert.equal(list.statusCode, 401);
  assert.deepEqual(list.json(), signIn);
});

test("choosing a player saves the uploader's slot and queues a job", async (t) => {
  const { app, db } = buildTestAppWithDb(t);
  const { token } = await registerUser(app);
  const uploaded = await uploadTestReplay(app, token, "test_team.rep");

  const response = await choosePlayer(app, token, uploaded.id, 2);
  assert.equal(response.statusCode, 200, response.body);
  const replay = replaySchema.parse(response.json());
  assert.equal(replay.status, "queued");
  assert.equal(replay.uploaderSlot, 2);
  assert.deepEqual(replay.players, uploaded.players);

  const jobs = db
    .prepare<[], { replayId: number; status: string; attempts: number }>(
      "SELECT replay_id AS replayId, status, attempts FROM jobs",
    )
    .all();
  assert.deepEqual(jobs, [
    { replayId: uploaded.id, status: "queued", attempts: 0 },
  ]);
});

test("choosing a player for a missing replay or someone else's is a 404", async (t) => {
  const app = buildTestApp(t);
  const { token: ownerToken } = await registerUser(app, "stew");
  const { token: otherToken } = await registerUser(app, "bread");
  const uploaded = await uploadTestReplay(app, ownerToken, "test_loss.rep");

  for (const [token, id] of [
    [otherToken, uploaded.id],
    [ownerToken, uploaded.id + 1],
  ] as const) {
    const response = await choosePlayer(app, token, id, 0);
    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.json(), { message: "Replay not found" });
  }
});

test("choosing a player twice is a 409 and queues only one job", async (t) => {
  const { app, db } = buildTestAppWithDb(t);
  const { token } = await registerUser(app);
  const uploaded = await uploadTestReplay(app, token, "test_loss.rep");
  assert.equal(
    (await choosePlayer(app, token, uploaded.id, 0)).statusCode,
    200,
  );

  const again = await choosePlayer(app, token, uploaded.id, 1);
  assert.equal(again.statusCode, 409);
  apiErrorSchema.parse(again.json());
  const { jobs } = db
    .prepare<[], { jobs: number }>("SELECT count(*) AS jobs FROM jobs")
    .get()!;
  assert.equal(jobs, 1);
});

test("choosing a slot no player has is a 400, and the replay still awaits a player", async (t) => {
  const app = buildTestApp(t);
  const { token } = await registerUser(app);
  const uploaded = await uploadTestReplay(app, token, "test_loss.rep");

  const emptySlot = await choosePlayer(app, token, uploaded.id, 3);
  assert.equal(emptySlot.statusCode, 400);
  assert.deepEqual(emptySlot.json(), { message: "No player has slot 3" });

  for (const slot of [4, -1, "0", null]) {
    const response = await choosePlayer(app, token, uploaded.id, slot);
    assert.equal(response.statusCode, 400, JSON.stringify(slot));
    apiErrorSchema.parse(response.json());
  }

  const [replay] = replayPageSchema.parse(
    (await listReplays(app, token)).json(),
  ).replays;
  assert.equal(replay?.status, "awaiting_player");
});

test("a non-numeric replay id is a 400", async (t) => {
  const app = buildTestApp(t);
  const { token } = await registerUser(app);
  const response = await app.inject({
    method: "POST",
    url: "/api/replays/abc/player",
    payload: { slot: 0 },
    cookies: { session: token },
  });
  assert.equal(response.statusCode, 400);
  apiErrorSchema.parse(response.json());
});

test("the replay list shows only the user's replays, newest first, a page at a time", async (t) => {
  const { app, db } = buildTestAppWithDb(t);
  const { token } = await registerUser(app, "stew");
  const { token: otherToken } = await registerUser(app, "bread");
  await uploadTestReplay(app, otherToken, "test_ffa.rep");

  // Upload one more replay than fits on a page, in a single request, then
  // spread their upload times so the order doesn't rely on ids.
  const count = replayPageSize + 1;
  const response = await postReplays(
    app,
    token,
    Array.from({ length: count }, (_, i) => ({
      filename: `game${i}.rep`,
      data: readTestReplay("test_loss.rep"),
    })),
  );
  const uploadedIds = uploadResponseSchema
    .parse(response.json())
    .files.map((file) => {
      assert.ok(file.outcome === "accepted");
      return file.replay.id;
    });
  uploadedIds.forEach((id, i) => {
    db.prepare("UPDATE replays SET uploaded_at = ? WHERE id = ?").run(
      new Date(Date.UTC(2026, 9, 1 + i)).toISOString(),
      id,
    );
  });
  const newestFirst = [...uploadedIds].reverse();

  const first = replayPageSchema.parse((await listReplays(app, token)).json());
  assert.equal(first.page, 1);
  assert.equal(first.pageSize, replayPageSize);
  assert.equal(first.total, count);
  assert.deepEqual(
    first.replays.map((replay) => replay.id),
    newestFirst.slice(0, replayPageSize),
  );
  assert.equal(first.replays[0]?.players.length, 2);

  const second = replayPageSchema.parse(
    (await listReplays(app, token, "?page=2")).json(),
  );
  assert.deepEqual(
    second.replays.map((replay) => replay.id),
    newestFirst.slice(replayPageSize),
  );

  const pastTheEnd = replayPageSchema.parse(
    (await listReplays(app, token, "?page=3")).json(),
  );
  assert.deepEqual(pastTheEnd.replays, []);
  assert.equal(pastTheEnd.total, count);
});

test("a new user's replay list is empty", async (t) => {
  const app = buildTestApp(t);
  const { token } = await registerUser(app);
  const response = await listReplays(app, token);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    replays: [],
    page: 1,
    pageSize: replayPageSize,
    total: 0,
  });
});

test("an invalid page number is a 400", async (t) => {
  const app = buildTestApp(t);
  const { token } = await registerUser(app);
  for (const query of [
    "?page=0",
    "?page=-1",
    "?page=abc",
    "?page=1.5",
    // Too large for the SQL OFFSET.
    "?page=1e300",
  ]) {
    const response = await listReplays(app, token, query);
    assert.equal(response.statusCode, 400, query);
    apiErrorSchema.parse(response.json());
  }
});
