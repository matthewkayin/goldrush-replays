// Queries on the jobs table, the queue between the API and the worker. A
// replay gets a new job row each time it is queued, and at most one of its
// jobs can be `queued` or `running` at a time.
import type Database from "better-sqlite3";

export interface Job {
  id: number;
  replayId: number;
  // Including the run that just claimed it.
  attempts: number;
}

export function insertJob(db: Database.Database, replayId: number): number {
  const result = db
    .prepare("INSERT INTO jobs (replay_id) VALUES (?)")
    .run(replayId);
  return Number(result.lastInsertRowid);
}

// Claims the oldest queued job and counts the attempt. It's one UPDATE, so
// two workers can't claim the same job.
export function claimNextJob(db: Database.Database): Job | null {
  const job = db
    .prepare<[string], Job>(
      `UPDATE jobs SET status = 'running', attempts = attempts + 1, locked_at = ?
       WHERE id = (SELECT id FROM jobs WHERE status = 'queued' ORDER BY id LIMIT 1)
       RETURNING id, replay_id AS replayId, attempts`,
    )
    .get(new Date().toISOString());
  return job ?? null;
}

export function completeJob(db: Database.Database, id: number): void {
  db.prepare(
    "UPDATE jobs SET status = 'done', locked_at = NULL WHERE id = ?",
  ).run(id);
}

// Records a failed attempt. The job goes back in the queue, or is `failed`
// when `final` is set.
export function failJobAttempt(
  db: Database.Database,
  id: number,
  error: string,
  final: boolean,
): void {
  db.prepare(
    "UPDATE jobs SET status = ?, last_error = ?, locked_at = NULL WHERE id = ?",
  ).run(final ? "failed" : "queued", error, id);
}

// Puts jobs left `running` by a worker that stopped back in the queue. The
// interrupted run doesn't count as an attempt, since the replay didn't fail.
export function requeueRunningJobs(db: Database.Database): number {
  const result = db
    .prepare(
      `UPDATE jobs SET status = 'queued', locked_at = NULL,
         attempts = max(attempts - 1, 0)
       WHERE status = 'running'`,
    )
    .run();
  return result.changes;
}
