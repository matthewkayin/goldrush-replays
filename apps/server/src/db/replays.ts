// Queries on the replays table. A replay is always read together with its
// match_players rows, as the one `replaySchema` shape every endpoint returns.
import type Database from "better-sqlite3";
import { replaySchema, type Replay } from "@goldrush/shared";

interface ReplayRow {
  id: number;
  filename: string;
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
      `SELECT id, original_filename AS filename, uploaded_at AS uploadedAt,
              processed_at AS processedAt, map_type AS mapType,
              replay_version AS replayVersion, duration_ticks AS durationTicks,
              status, error, uploader_slot AS uploaderSlot
       FROM replays WHERE id IN (SELECT value FROM json_each(?))`,
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
