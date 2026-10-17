// The PRD's win/loss rule. The analyzer reports when each player was
// defeated but not who won, because the rule depends on who uploaded the
// replay, which the analyzer never sees.
import type { MatchResult } from "@goldrush/shared";

export interface PlayerStanding {
  slot: number;
  team: number;
  // null if the player was still active when the replay ended. Leaving or
  // disconnecting counts as a defeat.
  defeatedAtTick: number | null;
}

// Each player's result, by slot.
//
// - The last team with at least one active player wins, and everyone else
//   loses.
// - A replay stops recording when the uploader leaves. So if more than one
//   team is still active at the end, the uploader left while an opponent was
//   still playing: the uploader's team loses, and the other active teams
//   win.
// - If no one is active at the end, the winner can't be known, so no one
//   wins. The uploader either lost or left before the end, so a loss is
//   right for them either way.
export function decideResults(
  players: PlayerStanding[],
  uploaderSlot: number,
): Map<number, MatchResult> {
  const uploader = players.find((player) => player.slot === uploaderSlot);
  if (!uploader) {
    throw new Error(`No player has the uploader's slot ${uploaderSlot}`);
  }

  const activeTeams = new Set(
    players
      .filter((player) => player.defeatedAtTick === null)
      .map((player) => player.team),
  );
  // With one team left it won. With several, the uploader left early, so
  // every active team except theirs wins. With none, no one wins.
  const winningTeams = activeTeams;
  if (activeTeams.size > 1) {
    winningTeams.delete(uploader.team);
  }

  return new Map(
    players.map((player) => [
      player.slot,
      winningTeams.has(player.team) ? "win" : "loss",
    ]),
  );
}
