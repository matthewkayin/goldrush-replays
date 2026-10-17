// Calls to the public /api/matches endpoints and the hooks the match page
// uses. The overview polls while the replay is waiting for the worker, and
// the analysis loads once the replay is processed.
import { useQuery } from "@tanstack/react-query";
import {
  analysisSchema,
  replaySchema,
  type Analysis,
  type Replay,
  type ReplayStatus,
} from "@goldrush/shared";
import { apiGet } from "./client.ts";

export const matchPollIntervalMs = 2000;

export function matchKey(id: number) {
  return ["match", id] as const;
}

export function matchAnalysisKey(id: number) {
  return ["match", id, "analysis"] as const;
}

export function fetchMatch(id: number): Promise<Replay> {
  return apiGet(`/api/matches/${id}`, replaySchema);
}

export function fetchMatchAnalysis(id: number): Promise<Analysis> {
  return apiGet(`/api/matches/${id}/analysis`, analysisSchema);
}

// Not a JSON call: the page links to it so the browser downloads the file.
export function replayDownloadPath(id: number): string {
  return `/api/matches/${id}/replay`;
}

// True while the worker still has the replay, so its status will change
// without anyone acting on it.
export function isWaitingForAnalysis(status: ReplayStatus): boolean {
  return status === "queued" || status === "processing";
}

// For useQuery's refetchInterval: poll until the replay leaves the queue.
export function matchRefetchInterval(
  replay: Replay | undefined,
): number | false {
  return replay && isWaitingForAnalysis(replay.status)
    ? matchPollIntervalMs
    : false;
}

export function useMatch(id: number) {
  return useQuery({
    queryKey: matchKey(id),
    queryFn: () => fetchMatch(id),
    refetchInterval: (query) => matchRefetchInterval(query.state.data),
  });
}

// Only fetches once `replay` is processed. A stored analysis never changes,
// so it is never refetched.
export function useMatchAnalysis(id: number, replay: Replay | undefined) {
  return useQuery({
    queryKey: matchAnalysisKey(id),
    queryFn: () => fetchMatchAnalysis(id),
    enabled: replay?.status === "processed",
    staleTime: Infinity,
  });
}
