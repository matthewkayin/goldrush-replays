// Checks the job worker with the real analyzer: claiming jobs, saving an
// analysis and the players' results, retries, failure, the concurrency
// limit and requeueing after a stop. Uses test_loss.rep, which analyzes in
// about 1.5 s.
import assert from "node:assert/strict";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import type Database from "better-sqlite3";
import { DEFAULT_ANALYZER_PATH, type WorkerConfig } from "../src/config.ts";
import { claimNextJob, type Job } from "../src/db/jobs.ts";
import { findReplay } from "../src/db/replays.ts";
import {
  claimJob,
  runJob,
  startWorker,
  type WorkerLog,
} from "../src/job-runner.ts";
import { buildTestAppWithDb, registerUser } from "./helpers.ts";
import {
  queueTestReplay,
  readExpectedAnalysis,
  readTestReplay,
} from "./replay-helpers.ts";

const config: WorkerConfig = {
  analyzerPath: DEFAULT_ANALYZER_PATH,
  concurrency: 2,
  pollIntervalMs: 20,
  analyzeTimeoutMs: 60_000,
  maxAttempts: 3,
};

const silent: WorkerLog = { info: () => {}, error: () => {} };

// A user's queued test_loss.rep, with the uploader in slot 0.
async function setUp(t: Parameters<typeof buildTestAppWithDb>[0]) {
  const { app, db } = buildTestAppWithDb(t);
  const { token } = await registerUser(app);
  const queue = () => queueTestReplay(app, token, "test_loss.rep", 0);
  return { db, queue };
}

interface JobRow {
  status: string;
  attempts: number;
  lastError: string | null;
}

function jobsOf(db: Database.Database, replayId: number): JobRow[] {
  return db
    .prepare<[number], JobRow>(
      `SELECT status, attempts, last_error AS lastError FROM jobs
       WHERE replay_id = ? ORDER BY id`,
    )
    .all(replayId);
}

function replaceReplayFile(
  db: Database.Database,
  replayId: number,
  data: Buffer,
) {
  db.prepare("UPDATE replay_files SET data = ? WHERE replay_id = ?").run(
    data,
    replayId,
  );
}

function claim(db: Database.Database): Job {
  const job = claimJob(db);
  assert.ok(job, "a job should be queued");
  return job;
}

async function waitFor(condition: () => boolean, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    assert.ok(Date.now() < deadline, "timed out waiting for the worker");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

test("claiming a job counts the attempt and marks the replay processing", async (t) => {
  const { db, queue } = await setUp(t);
  const replay = await queue();

  const job = claim(db);
  assert.deepEqual(job, { id: job.id, replayId: replay.id, attempts: 1 });
  assert.equal(findReplay(db, replay.id)?.status, "processing");
  assert.deepEqual(jobsOf(db, replay.id), [
    { status: "running", attempts: 1, lastError: null },
  ]);
  // The job is no longer queued, so it can't be claimed twice.
  assert.equal(claimNextJob(db), null);
});

test("jobs are claimed oldest first", async (t) => {
  const { db, queue } = await setUp(t);
  const first = await queue();
  const second = await queue();
  assert.equal(claim(db).replayId, first.id);
  assert.equal(claim(db).replayId, second.id);
});

test("a processed job stores the analysis, the players' results and stats", async (t) => {
  const { db, queue } = await setUp(t);
  const queued = await queue();

  await runJob(db, claim(db), config, silent);

  const replay = findReplay(db, queued.id);
  assert.ok(replay);
  assert.equal(replay.status, "processed");
  assert.equal(replay.error, null);
  assert.equal(replay.durationTicks, 51764);
  assert.ok(replay.processedAt);
  // Both players were active when the replay ended, so the uploader left
  // and lost.
  assert.deepEqual(
    replay.players.map(({ name, result, defeatedAtTick }) => ({
      name,
      result,
      defeatedAtTick,
    })),
    [
      { name: "stew", result: "loss", defeatedAtTick: null },
      { name: "Bot", result: "win", defeatedAtTick: null },
    ],
  );
  assert.deepEqual(jobsOf(db, queued.id), [
    { status: "done", attempts: 1, lastError: null },
  ]);

  const expected = readExpectedAnalysis("test_loss") as {
    players: { summary: Record<string, number> }[];
  };
  const stored = db
    .prepare<[number], { analyzerVersion: number; data: Buffer }>(
      "SELECT analyzer_version AS analyzerVersion, data FROM replay_analyses WHERE replay_id = ?",
    )
    .get(queued.id);
  assert.equal(stored?.analyzerVersion, 1);
  assert.deepEqual(JSON.parse(gunzipSync(stored.data).toString()), expected);

  const stats = db
    .prepare<[number], Record<string, number>>(
      `SELECT apm, gold_mined_total, peak_army_population, peak_army_value,
              units_built, units_lost, kills, buildings_built,
              upgrades_completed, supply_blocked_count, supply_blocked_ticks
       FROM match_players WHERE replay_id = ? ORDER BY slot`,
    )
    .all(queued.id);
  assert.deepEqual(
    stats,
    expected.players.map((player) => player.summary),
  );
});

test("a failed attempt requeues the job, and the last one fails the replay with the analyzer's reason", async (t) => {
  const { db, queue } = await setUp(t);
  const replay = await queue();
  replaceReplayFile(
    db,
    replay.id,
    readTestReplay("invalid/truncated_entries.rep"),
  );
  const reason = "Replay file is truncated.";

  for (const attempt of [1, 2]) {
    await runJob(db, claim(db), config, silent);
    assert.equal(findReplay(db, replay.id)?.status, "queued");
    assert.deepEqual(jobsOf(db, replay.id), [
      { status: "queued", attempts: attempt, lastError: reason },
    ]);
  }

  await runJob(db, claim(db), config, silent);
  const failed = findReplay(db, replay.id);
  assert.equal(failed?.status, "failed");
  assert.equal(failed.error, reason);
  assert.equal(failed.processedAt, null);
  assert.deepEqual(jobsOf(db, replay.id), [
    { status: "failed", attempts: 3, lastError: reason },
  ]);
  assert.equal(claimJob(db), null);
});

test("a timed-out analysis counts as a failed attempt", async (t) => {
  const { db, queue } = await setUp(t);
  const replay = await queue();

  await runJob(
    db,
    claim(db),
    { ...config, analyzeTimeoutMs: 50, maxAttempts: 1 },
    silent,
  );
  const failed = findReplay(db, replay.id);
  assert.equal(failed?.status, "failed");
  assert.equal(failed.error, "The analyzer timed out after 0.05 s.");
});

test("a server-side failure doesn't show its details on the replay", async (t) => {
  const { db, queue } = await setUp(t);
  const replay = await queue();

  await runJob(
    db,
    claim(db),
    { ...config, analyzerPath: "/nonexistent/analyzer", maxAttempts: 1 },
    silent,
  );
  const failed = findReplay(db, replay.id);
  assert.equal(failed?.status, "failed");
  assert.equal(
    failed.error,
    "The replay couldn't be analyzed because of a server error.",
  );
  assert.match(jobsOf(db, replay.id)[0]?.lastError ?? "", /ENOENT/);
});

test("the worker runs at most `concurrency` jobs at once and processes them all", async (t) => {
  const { db, queue } = await setUp(t);
  const replays = [await queue(), await queue(), await queue()];

  const worker = startWorker(db, config, silent);
  t.after(() => worker.stop());
  const statuses = () => replays.map(({ id }) => findReplay(db, id)?.status);
  // The first poll claims jobs as soon as the worker starts.
  assert.deepEqual(statuses(), ["processing", "processing", "queued"]);

  await waitFor(() => statuses().every((status) => status === "processed"));
});

test("stopping the worker leaves its jobs running, and the next worker requeues them", async (t) => {
  const { db, queue } = await setUp(t);
  const replay = await queue();

  const first = startWorker(db, config, silent);
  assert.equal(findReplay(db, replay.id)?.status, "processing");
  await first.stop();
  assert.equal(findReplay(db, replay.id)?.status, "processing");
  assert.deepEqual(jobsOf(db, replay.id), [
    { status: "running", attempts: 1, lastError: null },
  ]);

  // A worker that claims nothing, to see the requeue on its own. The
  // interrupted run doesn't count as an attempt.
  const second = startWorker(db, { ...config, concurrency: 0 }, silent);
  await second.stop();
  assert.equal(findReplay(db, replay.id)?.status, "queued");
  assert.deepEqual(jobsOf(db, replay.id), [
    { status: "queued", attempts: 0, lastError: null },
  ]);

  const third = startWorker(db, config, silent);
  t.after(() => third.stop());
  await waitFor(() => findReplay(db, replay.id)?.status === "processed");
  assert.deepEqual(jobsOf(db, replay.id), [
    { status: "done", attempts: 1, lastError: null },
  ]);
});
