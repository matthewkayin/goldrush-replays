// Checks the "Upload a replay and say which player I was" story, the public
// replay list, "My replays" and the list's filters through the HTTP API,
// with the real analyzer.
import assert from "node:assert/strict";
import { test } from "node:test";
import type Database from "better-sqlite3";
import {
  apiErrorSchema,
  matchFormat,
  maxReplayFileBytes,
  replayPageSchema,
  replayPageSize,
  replaySchema,
  uploadResponseSchema,
  type Replay,
} from "@goldrush/shared";
import type { App } from "../src/app.ts";
import { buildTestApp, buildTestAppWithDb, registerUser } from "./helpers.ts";
import {
  choosePlayer,
  postReplays,
  queueTestReplay,
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
  assert.equal(replay.uploaderUsername, user.username);
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

test("a visitor can't upload, choose a player or list their own replays", async (t) => {
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

  const list = await listReplays(app, undefined, "?mine=true");
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
    (await listReplays(app, token, "?mine=true")).json(),
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

test("the public replay list shows processed replays from every uploader, newest first, a page at a time", async (t) => {
  const { app, db } = buildTestAppWithDb(t);
  const { token } = await registerUser(app, "stew");
  const { token: otherToken } = await registerUser(app, "bread");

  // A replay at each status other than processed, which the list leaves out.
  await uploadTestReplay(app, token, "test_loss.rep");
  const failed = await queueTestReplay(app, token, "test_loss.rep", 0);
  db.prepare("UPDATE replays SET status = 'failed' WHERE id = ?").run(
    failed.id,
  );
  await queueTestReplay(app, otherToken, "test_loss.rep", 0);

  // One more processed replay than fits on a page, alternating uploaders,
  // with upload times spread so the order doesn't rely on ids.
  const count = replayPageSize + 1;
  const processedIds: number[] = [];
  for (let i = 0; i < count; i++) {
    const replay = await queueTestReplay(
      app,
      i % 2 === 0 ? token : otherToken,
      "test_loss.rep",
      0,
    );
    db.prepare(
      "UPDATE replays SET status = 'processed', uploaded_at = ? WHERE id = ?",
    ).run(new Date(Date.UTC(2026, 9, 1 + i)).toISOString(), replay.id);
    processedIds.push(replay.id);
  }
  const newestFirst = [...processedIds].reverse();

  // Signed in or not, the list is the same.
  for (const viewer of [undefined, token]) {
    const first = replayPageSchema.parse(
      (await listReplays(app, viewer)).json(),
    );
    assert.equal(first.page, 1);
    assert.equal(first.pageSize, replayPageSize);
    assert.equal(first.total, count);
    assert.deepEqual(
      first.replays.map((replay) => replay.id),
      newestFirst.slice(0, replayPageSize),
    );
    assert.deepEqual(
      first.replays.slice(0, 2).map((replay) => replay.uploaderUsername),
      ["stew", "bread"],
    );

    const second = replayPageSchema.parse(
      (await listReplays(app, viewer, "?page=2")).json(),
    );
    assert.deepEqual(
      second.replays.map((replay) => replay.id),
      newestFirst.slice(replayPageSize),
    );
  }
});

test("an empty site's public replay list is empty", async (t) => {
  const app = buildTestApp(t);
  const response = await listReplays(app, undefined);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    replays: [],
    page: 1,
    pageSize: replayPageSize,
    total: 0,
  });
});

test("my replays shows only the user's replays, unprocessed ones included, newest first, a page at a time", async (t) => {
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

  const first = replayPageSchema.parse(
    (await listReplays(app, token, "?mine=true")).json(),
  );
  assert.equal(first.page, 1);
  assert.equal(first.pageSize, replayPageSize);
  assert.equal(first.total, count);
  assert.deepEqual(
    first.replays.map((replay) => replay.id),
    newestFirst.slice(0, replayPageSize),
  );
  assert.equal(first.replays[0]?.players.length, 2);

  const second = replayPageSchema.parse(
    (await listReplays(app, token, "?mine=true&page=2")).json(),
  );
  assert.deepEqual(
    second.replays.map((replay) => replay.id),
    newestFirst.slice(replayPageSize),
  );

  const pastTheEnd = replayPageSchema.parse(
    (await listReplays(app, token, "?mine=true&page=3")).json(),
  );
  assert.deepEqual(pastTheEnd.replays, []);
  assert.equal(pastTheEnd.total, count);
});

test("a new user's own replay list is empty", async (t) => {
  const app = buildTestApp(t);
  const { token } = await registerUser(app);
  const response = await listReplays(app, token, "?mine=true");
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    replays: [],
    page: 1,
    pageSize: replayPageSize,
    total: 0,
  });
});

test("an invalid page number or filter is a 400", async (t) => {
  const app = buildTestApp(t);
  const { token } = await registerUser(app);
  for (const query of [
    "?page=0",
    "?page=-1",
    "?page=abc",
    "?page=1.5",
    // Too large for the SQL OFFSET.
    "?page=1e300",
    "?mine=maybe",
    "?format=3v3",
    "?uploadedFrom=2026-10-01",
    "?uploadedBefore=yesterday",
    `?player=${"x".repeat(101)}`,
  ]) {
    const response = await listReplays(app, token, query);
    assert.equal(response.statusCode, 400, query);
    apiErrorSchema.parse(response.json());
  }
});

// Queues a test replay and marks it processed at the given upload time, so
// the public list shows it.
async function processedTestReplay(
  app: App,
  db: Database.Database,
  token: string,
  name: string,
  uploadedAt: string,
): Promise<Replay> {
  const replay = await queueTestReplay(app, token, name, 0);
  db.prepare(
    "UPDATE replays SET status = 'processed', uploaded_at = ? WHERE id = ?",
  ).run(uploadedAt, replay.id);
  return replay;
}

async function listedIds(
  app: App,
  token: string | undefined,
  query: string,
): Promise<number[]> {
  const response = await listReplays(app, token, query);
  assert.equal(response.statusCode, 200, response.body);
  const page = replayPageSchema.parse(response.json());
  assert.equal(page.total, page.replays.length, query);
  return page.replays.map((replay) => replay.id);
}

test("text filters match case-insensitively anywhere in the value, with % and _ taken literally", async (t) => {
  const { app, db } = buildTestAppWithDb(t);
  const { token: kayin } = await registerUser(app, "Kayin");
  const { token: xkayx } = await registerUser(app, "xKAYx");
  const { token: stew } = await registerUser(app, "stew");
  const at = new Date(Date.UTC(2026, 9, 1)).toISOString();
  const first = await processedTestReplay(app, db, kayin, "test_loss.rep", at);
  const second = await processedTestReplay(app, db, xkayx, "test_ffa.rep", at);
  const third = await processedTestReplay(app, db, stew, "test_team.rep", at);
  const rename = db.prepare(
    "UPDATE replays SET original_filename = ? WHERE id = ?",
  );
  rename.run("Final 100%.rep", first.id);
  rename.run("final_1000.rep", second.id);
  rename.run("practice.rep", third.id);
  // A player other than the uploader's, so the player filter is seen to
  // look at everyone in the replay.
  db.prepare(
    "UPDATE match_players SET name = 'Gold_Digger' WHERE replay_id = ? AND slot = 2",
  ).run(third.id);

  const sorted = async (query: string) =>
    (await listedIds(app, undefined, query)).sort((a, b) => a - b);
  assert.deepEqual(await sorted("?uploader=kay"), [first.id, second.id]);
  assert.deepEqual(await sorted("?uploader=KAYIN"), [first.id]);
  assert.deepEqual(await sorted("?uploader=%20stew%20"), [third.id]);
  assert.deepEqual(await sorted("?filename=FINAL"), [first.id, second.id]);
  assert.deepEqual(await sorted("?filename=100%25"), [first.id]);
  assert.deepEqual(await sorted("?filename=l_1"), [second.id]);
  assert.deepEqual(await sorted("?filename=l%251"), []);
  assert.deepEqual(await sorted("?player=gold_dig"), [third.id]);
  assert.deepEqual(await sorted("?player=bot"), [
    first.id,
    second.id,
    third.id,
  ]);
  assert.deepEqual(await sorted("?player=STEW"), [first.id, third.id]);
  // An empty filter is no filter.
  assert.deepEqual(await sorted("?uploader=&player=%20"), [
    first.id,
    second.id,
    third.id,
  ]);
});

test("the format filter works the format out from team sizes, as the list shows it", async (t) => {
  const { app, db } = buildTestAppWithDb(t);
  const { token } = await registerUser(app, "stew");
  const at = new Date(Date.UTC(2026, 9, 1)).toISOString();
  const oneVsOne = await processedTestReplay(
    app,
    db,
    token,
    "test_loss.rep",
    at,
  );
  const twoVsTwo = await processedTestReplay(
    app,
    db,
    token,
    "test_team.rep",
    at,
  );
  const ffa = await processedTestReplay(app, db, token, "test_ffa.rep", at);
  // A 2v1v1, made from the FFA by putting two players on one team.
  const other = await processedTestReplay(app, db, token, "test_ffa.rep", at);
  db.prepare(
    "UPDATE match_players SET team = 0 WHERE replay_id = ? AND slot = 1",
  ).run(other.id);

  const expected = { "1v1": oneVsOne, "2v2": twoVsTwo, FFA: ffa, Other: other };
  for (const [format, replay] of Object.entries(expected)) {
    const ids = await listedIds(app, undefined, `?format=${format}`);
    assert.deepEqual(ids, [replay.id], format);
    const [listed] = replayPageSchema.parse(
      (await listReplays(app, undefined, `?format=${format}`)).json(),
    ).replays;
    assert.equal(matchFormat(listed!.players), format);
  }
});

test("the upload date filter includes its start and excludes its end", async (t) => {
  const { app, db } = buildTestAppWithDb(t);
  const { token } = await registerUser(app, "stew");
  const times = [
    "2026-10-01T23:59:59.999Z",
    "2026-10-02T00:00:00.000Z",
    "2026-10-02T23:59:59.999Z",
    "2026-10-03T00:00:00.000Z",
  ];
  const ids: number[] = [];
  for (const time of times) {
    ids.push(
      (await processedTestReplay(app, db, token, "test_loss.rep", time)).id,
    );
  }
  const [beforeDay, dayStart, dayEnd, afterDay] = ids;

  const day =
    "uploadedFrom=2026-10-02T00:00:00Z&uploadedBefore=2026-10-03T00:00:00Z";
  assert.deepEqual(await listedIds(app, undefined, `?${day}`), [
    dayEnd,
    dayStart,
  ]);
  // Either end can be left out, and an offset is turned into UTC.
  assert.deepEqual(
    await listedIds(
      app,
      undefined,
      "?uploadedFrom=2026-10-03T02:00:00%2B02:00",
    ),
    [afterDay],
  );
  assert.deepEqual(
    await listedIds(app, undefined, "?uploadedBefore=2026-10-02T00:00:00.000Z"),
    [beforeDay],
  );
});

test("filters combine, and combine with my replays at every status", async (t) => {
  const { app, db } = buildTestAppWithDb(t);
  const { token } = await registerUser(app, "stew");
  const { token: otherToken } = await registerUser(app, "bread");
  const early = new Date(Date.UTC(2026, 9, 1)).toISOString();
  const late = new Date(Date.UTC(2026, 9, 5)).toISOString();
  const match = await processedTestReplay(
    app,
    db,
    token,
    "test_loss.rep",
    late,
  );
  await processedTestReplay(app, db, token, "test_loss.rep", early);
  await processedTestReplay(app, db, token, "test_ffa.rep", late);
  await processedTestReplay(app, db, otherToken, "test_loss.rep", late);
  // Unprocessed, so only "My replays" shows it.
  const awaiting = await uploadTestReplay(app, token, "test_loss.rep");
  db.prepare("UPDATE replays SET uploaded_at = ? WHERE id = ?").run(
    new Date(Date.UTC(2026, 9, 6)).toISOString(),
    awaiting.id,
  );

  const filters = "uploader=st&format=1v1&uploadedFrom=2026-10-03T00:00:00Z";
  assert.deepEqual(await listedIds(app, undefined, `?${filters}`), [match.id]);
  assert.deepEqual(await listedIds(app, token, `?mine=true&${filters}`), [
    awaiting.id,
    match.id,
  ]);
  assert.deepEqual(
    await listedIds(app, otherToken, `?mine=true&${filters}`),
    [],
  );
});
