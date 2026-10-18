// How a replay's fields are shown on the upload and replay list pages.
import type { MatchPlayer, Replay, ReplayStatus } from "@goldrush/shared";
import { formatTick } from "../../display.ts";

// A replay's duration is null until it is processed.
export function formatDuration(ticks: number | null): string {
  return ticks === null ? "–" : formatTick(ticks);
}

// The player the uploader said they were, or undefined before they choose.
export function uploaderPlayer(replay: Replay): MatchPlayer | undefined {
  return replay.players.find((player) => player.slot === replay.uploaderSlot);
}

export function uploaderResultLabel(replay: Replay): string {
  const result = uploaderPlayer(replay)?.result;
  if (result === "win") {
    return "Win";
  }
  if (result === "loss") {
    return "Loss";
  }
  return "–";
}

export type MatchFormat = "1v1" | "2v2" | "FFA" | "Other";

// The format from team sizes, counting bots as players: two teams of one is
// 1v1, two teams of two is 2v2, three or four players each on their own team
// is FFA, and any other layout (2v1, 3v1, 2v1v1) is Other.
export function matchFormat(players: Pick<MatchPlayer, "team">[]): MatchFormat {
  const teamSizes = new Map<number, number>();
  for (const { team } of players) {
    teamSizes.set(team, (teamSizes.get(team) ?? 0) + 1);
  }
  const sizes = [...teamSizes.values()];
  if (sizes.length === 2 && sizes.every((size) => size === 1)) {
    return "1v1";
  }
  if (sizes.length === 2 && sizes.every((size) => size === 2)) {
    return "2v2";
  }
  if (sizes.length >= 3 && sizes.every((size) => size === 1)) {
    return "FFA";
  }
  return "Other";
}

// The players whose result is a win. Empty when nobody won (no player was
// active at the end), which the list shows as "No winner".
export function winners(players: MatchPlayer[]): MatchPlayer[] {
  return players.filter((player) => player.result === "win");
}

export const statusDisplay: Record<
  ReplayStatus,
  {
    label: string;
    color: "default" | "info" | "success" | "warning" | "error";
  }
> = {
  awaiting_player: { label: "Choose your player", color: "warning" },
  queued: { label: "Queued", color: "default" },
  processing: { label: "Processing", color: "info" },
  processed: { label: "Processed", color: "success" },
  failed: { label: "Failed", color: "error" },
};
