// Calls to /api/replays and the hooks the upload and replay list pages use.
// Each page of the list lives in the TanStack Query cache under
// replayPageKey(params), and uploads and player choices invalidate every
// page, since either one changes what the list shows.
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  replayPageSchema,
  replaySchema,
  replayUploadField,
  uploadResponseSchema,
  type Replay,
  type ReplayPage,
  type UploadResult,
} from "@goldrush/shared";
import {
  replayListQuery,
  type ListParams,
} from "../pages/replays/page-param.ts";
import { apiGet, apiPost } from "./client.ts";

const replaysKey = ["replays"] as const;

export function replayPageKey(params: ListParams) {
  return [...replaysKey, params] as const;
}

// How often the list is refetched while a replay on it is being analyzed.
export const replayPollIntervalMs = 2000;

// One result per file, in the order the files were given.
export async function uploadReplays(files: File[]): Promise<UploadResult[]> {
  const body = new FormData();
  for (const file of files) {
    body.append(replayUploadField, file);
  }
  const response = await apiPost("/api/replays", body, uploadResponseSchema);
  return response.files;
}

// Returns the replay, now queued for analysis.
export function choosePlayer(replayId: number, slot: number): Promise<Replay> {
  return apiPost(`/api/replays/${replayId}/player`, { slot }, replaySchema);
}

// `mine` lists the signed-in user's own replays at every status instead of
// processed replays from everyone. The filters narrow either list.
export function fetchReplayPage(params: ListParams): Promise<ReplayPage> {
  return apiGet(`/api/replays?${replayListQuery(params)}`, replayPageSchema);
}

// True while the worker still has to finish a replay on the page, so the
// list keeps polling until every status there is settled.
export function pageHasPendingAnalysis(page: ReplayPage): boolean {
  return page.replays.some(
    (replay) => replay.status === "queued" || replay.status === "processing",
  );
}

// While a new page or filter loads, the previous page stays on screen.
export function useReplayPage(params: ListParams) {
  return useQuery({
    queryKey: replayPageKey(params),
    queryFn: () => fetchReplayPage(params),
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      query.state.data && pageHasPendingAnalysis(query.state.data)
        ? replayPollIntervalMs
        : false,
  });
}

export function useUploadReplays() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: uploadReplays,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: replaysKey }),
  });
}

export function useChoosePlayer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ replayId, slot }: { replayId: number; slot: number }) =>
      choosePlayer(replayId, slot),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: replaysKey }),
  });
}
