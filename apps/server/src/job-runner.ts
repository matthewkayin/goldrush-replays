// The worker's job loop: claims queued jobs, runs `analyzer analyze` on each
// replay and saves the results. worker.ts starts it as its own process;
// tests call startWorker and runJob directly.
import { gzipSync } from "node:zlib";
import type Database from "better-sqlite3";
import type { Analysis } from "@goldrush/shared";
import { AnalyzerError, analyzeReplay } from "./analyzer.ts";
import type { WorkerConfig } from "./config.ts";
import {
  claimNextJob,
  completeJob,
  failJobAttempt,
  requeueRunningJobs,
  type Job,
} from "./db/jobs.ts";
import { saveMatchPlayerOutcomes } from "./db/match-players.ts";
import { insertReplayAnalysis } from "./db/replay-analyses.ts";
import { findReplayFile } from "./db/replay-files.ts";
import {
  findReplay,
  markReplayFailed,
  markReplayProcessed,
  requeueProcessingReplays,
  setReplayStatus,
} from "./db/replays.ts";
import { decideResults } from "./win-loss.ts";

export interface WorkerLog {
  info(message: string): void;
  error(message: string, error: unknown): void;
}

export interface Worker {
  // Stops claiming jobs and kills running analyses. Their jobs stay
  // `running` and are requeued the next time a worker starts.
  stop(): Promise<void>;
}

// Shown on a failed replay when the cause was the server, not the replay.
const SERVER_ERROR =
  "The replay couldn't be analyzed because of a server error.";

// Requeues jobs a previous worker left running, then polls for queued jobs
// until stopped, running up to `config.concurrency` at once.
export function startWorker(
  db: Database.Database,
  config: WorkerConfig,
  log: WorkerLog,
): Worker {
  const requeued = requeueInterruptedJobs(db);
  if (requeued > 0) {
    log.info(`Requeued ${requeued} job(s) left running by a previous worker`);
  }

  const controller = new AbortController();
  const running = new Set<Promise<void>>();
  function poll() {
    try {
      while (running.size < config.concurrency) {
        const job = claimJob(db);
        if (!job) {
          return;
        }
        const run = runJob(db, job, config, log, controller.signal).finally(
          () => running.delete(run),
        );
        running.add(run);
      }
    } catch (error) {
      // E.g. the database was busy for longer than its timeout. The next
      // poll tries again.
      log.error("Couldn't claim a job", error);
    }
  }

  poll();
  const timer = setInterval(poll, config.pollIntervalMs);
  return {
    async stop() {
      clearInterval(timer);
      controller.abort();
      await Promise.all(running);
    },
  };
}

// Every transaction here that writes is IMMEDIATE: it takes the write lock
// before its first read. The API writes to the same file from another
// process, and a deferred transaction that read first would fail with
// SQLITE_BUSY_SNAPSHOT, without waiting, if the API committed in between.
function requeueInterruptedJobs(db: Database.Database): number {
  return db
    .transaction(() => {
      requeueProcessingReplays(db);
      return requeueRunningJobs(db);
    })
    .immediate();
}

// Claims the oldest queued job and marks its replay `processing`.
export function claimJob(db: Database.Database): Job | null {
  return db
    .transaction(() => {
      const job = claimNextJob(db);
      if (job) {
        setReplayStatus(db, job.replayId, "processing");
      }
      return job;
    })
    .immediate();
}

// Analyzes a claimed job's replay and saves the result, or records the
// failed attempt. Never rejects. If `signal` is aborted, the job is left
// `running` for the next worker to requeue.
export async function runJob(
  db: Database.Database,
  job: Job,
  config: WorkerConfig,
  log: WorkerLog,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const replayFile = findReplayFile(db, job.replayId);
    if (!replayFile) {
      throw new Error(`Replay ${job.replayId} has no file`);
    }
    const analysis = await analyzeReplay(config.analyzerPath, replayFile, {
      timeoutMs: config.analyzeTimeoutMs,
      signal,
    });
    saveAnalysis(db, job, analysis);
    log.info(`Analyzed replay ${job.replayId}`);
  } catch (error) {
    if (signal?.aborted) {
      return;
    }
    const final = job.attempts >= config.maxAttempts;
    log.error(
      `Analyzing replay ${job.replayId} failed (attempt ${job.attempts} of ${config.maxAttempts})`,
      error,
    );
    recordFailure(db, job, error, final);
  }
}

// Stores the analysis, fills in each player's result and stats, and marks
// the replay processed, all in one transaction.
function saveAnalysis(
  db: Database.Database,
  job: Job,
  analysis: Analysis,
): void {
  // Gzipping a long match's analysis takes a moment, so it's done before
  // taking the write lock.
  const gzippedAnalysis = gzipSync(JSON.stringify(analysis));
  db.transaction(() => {
    const replay = findReplay(db, job.replayId);
    if (!replay || replay.uploaderSlot === null) {
      throw new Error(`Replay ${job.replayId} has no uploader slot`);
    }
    const headerSlots = replay.players.map((player) => player.slot).join();
    const analysisSlots = analysis.players
      .map((player) => player.slot)
      .sort((a, b) => a - b)
      .join();
    if (headerSlots !== analysisSlots) {
      throw new Error(
        `The analysis has players in slots [${analysisSlots}], but the replay has [${headerSlots}]`,
      );
    }

    const results = decideResults(
      analysis.players.map((player) => ({
        slot: player.slot,
        team: player.team,
        defeatedAtTick: player.defeated_at_tick,
      })),
      replay.uploaderSlot,
    );
    insertReplayAnalysis(
      db,
      job.replayId,
      analysis.analyzer_version,
      gzippedAnalysis,
    );
    saveMatchPlayerOutcomes(
      db,
      job.replayId,
      analysis.players.map((player) => ({
        slot: player.slot,
        result: results.get(player.slot)!,
        defeatedAtTick: player.defeated_at_tick,
        summary: player.summary,
      })),
    );
    markReplayProcessed(db, job.replayId, analysis.duration_ticks);
    completeJob(db, job.id);
  }).immediate();
}

// Requeues the job, or on its last attempt marks it and its replay
// `failed`. The replay's error is shown to its uploader, so it only gives
// the analyzer's reason; the job keeps the full error.
function recordFailure(
  db: Database.Database,
  job: Job,
  error: unknown,
  final: boolean,
): void {
  const jobError = error instanceof Error ? error.message : String(error);
  db.transaction(() => {
    failJobAttempt(db, job.id, jobError, final);
    if (!final) {
      setReplayStatus(db, job.replayId, "queued");
    } else if (error instanceof AnalyzerError) {
      markReplayFailed(db, job.replayId, error.message);
    } else {
      markReplayFailed(db, job.replayId, SERVER_ERROR);
    }
  }).immediate();
}
