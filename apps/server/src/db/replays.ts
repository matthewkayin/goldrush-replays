// Queries on the replays table. A replay is always read together with its
// match_players rows, as the one `replaySchema` shape every endpoint returns.
// The writes further down are for upload, choosing a player and the worker.
import type Database from "better-sqlite3";
import {
  replaySchema,
  type MatchFormat,
  type Replay,
  type ReplayStatus,
} from "@goldrush/shared";

interface ReplayRow {
  id: number;
  filename: string;
  uploaderUsername: string;
  uploadedAt: string;
  processedAt: string | null;
  mapType: string;
  replayVersion: number;
  durationTicks: number | null;
  status: string;
  error: string | null;
  uploaderSlot: number | null;
}

interface PlayerRow {
  replayId: number;
  slot: number;
  name: string;
  team: number;
  color: string;
  result: string | null;
  defeatedAtTick: number | null;
}

export function findReplay(db: Database.Database, id: number): Replay | null {
  return findReplays(db, [id])[0] ?? null;
}

// The replays with these ids, in the order given. Ids that don't exist are
// left out. Uses two queries however many ids there are, so a list page
// doesn't query once per replay.
export function findReplays(db: Database.Database, ids: number[]): Replay[] {
  if (ids.length === 0) {
    return [];
  }
  const idsJson = JSON.stringify(ids);
  const replayRows = db
    .prepare<[string], ReplayRow>(
      `SELECT replays.id, original_filename AS filename,
              users.username AS uploaderUsername, uploaded_at AS uploadedAt,
              processed_at AS processedAt, map_type AS mapType,
              replay_version AS replayVersion, duration_ticks AS durationTicks,
              status, error, uploader_slot AS uploaderSlot
       FROM replays JOIN users ON users.id = replays.uploader_user_id
       WHERE replays.id IN (SELECT value FROM json_each(?))`,
    )
    .all(idsJson);
  const playerRows = db
    .prepare<[string], PlayerRow>(
      `SELECT replay_id AS replayId, slot, name, team, color, result,
              defeated_at_tick AS defeatedAtTick
       FROM match_players WHERE replay_id IN (SELECT value FROM json_each(?))
       ORDER BY slot`,
    )
    .all(idsJson);

  const replaysById = new Map(replayRows.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = replaysById.get(id);
    if (!row) {
      return [];
    }
    const players = playerRows
      .filter((player) => player.replayId === id)
      .map(({ replayId: _, ...player }) => player);
    // Parsing checks the TEXT columns that SQL doesn't constrain (map_type)
    // and gives them their enum types.
    return [replaySchema.parse({ ...row, players })];
  });
}

export interface NewReplay {
  uploaderUserId: number;
  filename: string;
  replayVersion: number;
  mapType: string;
}

// Inserts a replay awaiting the uploader's player choice. Its file and
// players go in replay_files and match_players, in the same transaction.
export function insertReplay(db: Database.Database, replay: NewReplay): number {
  const result = db
    .prepare(
      `INSERT INTO replays (uploader_user_id, original_filename, replay_version, map_type, uploaded_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      replay.uploaderUserId,
      replay.filename,
      replay.replayVersion,
      replay.mapType,
      new Date().toISOString(),
    );
  return Number(result.lastInsertRowid);
}

export interface ReplayOwnership {
  uploaderUserId: number;
  status: ReplayStatus;
}

export function findReplayOwnership(
  db: Database.Database,
  id: number,
): ReplayOwnership | null {
  const row = db
    .prepare<[number], ReplayOwnership>(
      "SELECT uploader_user_id AS uploaderUserId, status FROM replays WHERE id = ?",
    )
    .get(id);
  return row ?? null;
}

// Which replays a list shows. With a `userId` it is that user's "My
// replays", at every status; without one it is the public list of processed
// replays. Every other field is an optional filter (see
// replayListQuerySchema in @goldrush/shared), and a replay must match all of
// them.
export interface ReplayFilter {
  userId: number | null;
  uploader?: string | undefined;
  filename?: string | undefined;
  player?: string | undefined;
  format?: MatchFormat | undefined;
  uploadedFrom?: string | undefined;
  uploadedBefore?: string | undefined;
}

interface FilterParams {
  userId: number | null;
  uploader: string | null;
  filename: string | null;
  player: string | null;
  format: MatchFormat | null;
  uploadedFrom: string | null;
  uploadedBefore: string | null;
}

// Every filter is always bound, as NULL when unset, so the SQL never
// changes. Text filters use instr(), which has no wildcards, so `%` and `_`
// match literally. SQLite's lower() folds only ASCII case.
//
// The format is worked out from team sizes, the same rule as matchFormat()
// in @goldrush/shared.
const filteredReplays = `
  FROM replays JOIN users ON users.id = replays.uploader_user_id
  WHERE (CASE WHEN @userId IS NULL THEN replays.status = 'processed'
              ELSE replays.uploader_user_id = @userId END)
    AND (@uploader IS NULL
         OR instr(lower(users.username), lower(@uploader)) > 0)
    AND (@filename IS NULL
         OR instr(lower(replays.original_filename), lower(@filename)) > 0)
    AND (@player IS NULL OR EXISTS (
          SELECT 1 FROM match_players
          WHERE match_players.replay_id = replays.id
            AND instr(lower(match_players.name), lower(@player)) > 0))
    AND (@format IS NULL OR @format = (
          SELECT CASE
                   WHEN count(*) = 2 AND max(size) = 1 THEN '1v1'
                   WHEN count(*) = 2 AND min(size) = 2 AND max(size) = 2
                     THEN '2v2'
                   WHEN count(*) >= 3 AND max(size) = 1 THEN 'FFA'
                   ELSE 'Other'
                 END
          FROM (SELECT count(*) AS size FROM match_players
                WHERE match_players.replay_id = replays.id
                GROUP BY team)))
    AND (@uploadedFrom IS NULL OR replays.uploaded_at >= @uploadedFrom)
    AND (@uploadedBefore IS NULL OR replays.uploaded_at < @uploadedBefore)`;

function filterParams(filter: ReplayFilter): FilterParams {
  return {
    userId: filter.userId,
    uploader: filter.uploader ?? null,
    filename: filter.filename ?? null,
    player: filter.player ?? null,
    format: filter.format ?? null,
    uploadedFrom: filter.uploadedFrom ?? null,
    uploadedBefore: filter.uploadedBefore ?? null,
  };
}

// The ids of one page of the replays the filter selects, newest upload
// first. Read them with findReplays.
export function findReplayIds(
  db: Database.Database,
  filter: ReplayFilter,
  limit: number,
  offset: number,
): number[] {
  return db
    .prepare<
      [FilterParams & { limit: number; offset: number }],
      { id: number }
    >(
      `SELECT replays.id ${filteredReplays}
       ORDER BY replays.uploaded_at DESC, replays.id DESC
       LIMIT @limit OFFSET @offset`,
    )
    .all({ ...filterParams(filter), limit, offset })
    .map(({ id }) => id);
}

export function countReplays(
  db: Database.Database,
  filter: ReplayFilter,
): number {
  return db
    .prepare<[FilterParams], { n: number }>(
      `SELECT count(*) AS n ${filteredReplays}`,
    )
    .get(filterParams(filter))!.n;
}

// Saves the uploader's player and moves the replay to `queued`. Insert its
// job in the same transaction.
export function setUploaderSlot(
  db: Database.Database,
  id: number,
  slot: number,
): void {
  db.prepare(
    "UPDATE replays SET uploader_slot = ?, status = 'queued' WHERE id = ?",
  ).run(slot, id);
}

// For the worker's moves between `queued` and `processing`.
export function setReplayStatus(
  db: Database.Database,
  id: number,
  status: "queued" | "processing",
): void {
  db.prepare("UPDATE replays SET status = ? WHERE id = ?").run(status, id);
}

// Puts every replay the worker was processing back in the queue, for when
// the worker restarts after stopping mid-job.
export function requeueProcessingReplays(db: Database.Database): void {
  db.prepare(
    "UPDATE replays SET status = 'queued' WHERE status = 'processing'",
  ).run();
}

export function markReplayProcessed(
  db: Database.Database,
  id: number,
  durationTicks: number,
): void {
  db.prepare(
    `UPDATE replays SET status = 'processed', error = NULL, duration_ticks = ?,
       processed_at = ?
     WHERE id = ?`,
  ).run(durationTicks, new Date().toISOString(), id);
}

export function markReplayFailed(
  db: Database.Database,
  id: number,
  error: string,
): void {
  db.prepare(
    "UPDATE replays SET status = 'failed', error = ? WHERE id = ?",
  ).run(error, id);
}
