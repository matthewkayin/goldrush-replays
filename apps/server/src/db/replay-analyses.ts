// Queries on the replay_analyses table, which holds each processed replay's
// full analysis as gzipped JSON.
import type Database from "better-sqlite3";

export function insertReplayAnalysis(
  db: Database.Database,
  replayId: number,
  analyzerVersion: number,
  gzippedAnalysis: Buffer,
): void {
  db.prepare(
    "INSERT INTO replay_analyses (replay_id, analyzer_version, data) VALUES (?, ?, ?)",
  ).run(replayId, analyzerVersion, gzippedAnalysis);
}

// The gzipped analysis JSON, or null when none is stored for the replay.
export function findGzippedAnalysis(
  db: Database.Database,
  replayId: number,
): Buffer | null {
  const row = db
    .prepare<[number], { data: Buffer }>(
      "SELECT data FROM replay_analyses WHERE replay_id = ?",
    )
    .get(replayId);
  return row?.data ?? null;
}
