// How values from replays are shown anywhere on the site: match time, player
// colors, map names and teams.
import type { MapType, PlayerColor } from "@goldrush/shared";

// The simulation runs at 60 ticks per second.
export const ticksPerSecond = 60;

// A match timestamp or duration as m:ss. Minutes aren't wrapped into hours,
// so a long match reads 61:05.
export function formatTick(tick: number): string {
  const totalSeconds = Math.floor(tick / ticksPerSecond);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatSeconds(seconds: number): string {
  return formatTick(seconds * ticksPerSecond);
}

// The in-game colors, as the previous version of the site drew them.
export const playerColors: Record<PlayerColor, string> = {
  blue: "#6092a6",
  red: "#cc5e5c",
  green: "#6cb348",
  purple: "#9a6aab",
};

export const mapNames: Record<MapType, string> = {
  tombstone: "Tombstone",
  boulder: "Boulder",
  klondike: "Klondike",
};

// "Team 1" for team 0, as players see it in the game lobby.
export function teamName(team: number): string {
  return `Team ${team + 1}`;
}
