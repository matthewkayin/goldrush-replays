// Queries on the replay_files table, which holds each replay's original
// .rep bytes as a BLOB.
import type Database from "better-sqlite3";

export function insertReplayFile(
  db: Database.Database,
  replayId: number,
  data: Buffer,
): void {
  db.prepare("INSERT INTO replay_files (replay_id, data) VALUES (?, ?)").run(
    replayId,
    data,
  );
}

export function findReplayFile(
  db: Database.Database,
  replayId: number,
): Buffer | null {
  const row = db
    .prepare<[number], { data: Buffer }>(
      "SELECT data FROM replay_files WHERE replay_id = ?",
    )
    .get(replayId);
  return row?.data ?? null;
}
