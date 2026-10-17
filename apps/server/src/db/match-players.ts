// Writes to the match_players table. Rows are inserted at upload from
// `analyzer header`, and the worker fills in each player's result and
// summary stats once the replay is analyzed. Reads go through findReplay.
import type Database from "better-sqlite3";
import type {
  MatchResult,
  PlayerSummary,
  ReplayHeader,
} from "@goldrush/shared";

export function insertMatchPlayers(
  db: Database.Database,
  replayId: number,
  players: ReplayHeader["players"],
): void {
  const insert = db.prepare(
    "INSERT INTO match_players (replay_id, slot, name, team, color) VALUES (?, ?, ?, ?, ?)",
  );
  for (const player of players) {
    insert.run(replayId, player.slot, player.name, player.team, player.color);
  }
}

export interface MatchPlayerOutcome {
  slot: number;
  result: MatchResult;
  defeatedAtTick: number | null;
  summary: PlayerSummary;
}

// Throws if a player has no row from upload, so an analysis that doesn't
// match its replay's header is never half saved (call it in a transaction).
export function saveMatchPlayerOutcomes(
  db: Database.Database,
  replayId: number,
  outcomes: MatchPlayerOutcome[],
): void {
  const update = db.prepare(
    `UPDATE match_players SET
       result = @result, defeated_at_tick = @defeatedAtTick, apm = @apm,
       gold_mined_total = @gold_mined_total,
       peak_army_population = @peak_army_population,
       peak_army_value = @peak_army_value, units_built = @units_built,
       units_lost = @units_lost, kills = @kills,
       buildings_built = @buildings_built,
       upgrades_completed = @upgrades_completed,
       supply_blocked_count = @supply_blocked_count,
       supply_blocked_ticks = @supply_blocked_ticks
     WHERE replay_id = @replayId AND slot = @slot`,
  );
  for (const { slot, result, defeatedAtTick, summary } of outcomes) {
    const { changes } = update.run({
      ...summary,
      replayId,
      slot,
      result,
      defeatedAtTick,
    });
    if (changes !== 1) {
      throw new Error(`Replay ${replayId} has no player in slot ${slot}`);
    }
  }
}
