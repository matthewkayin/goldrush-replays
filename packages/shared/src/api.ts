// Contracts for the API's own JSON: health, the error shape, and the
// replay and match endpoints. API JSON is camelCase. The analysis endpoint
// is the exception: it passes the analyzer's snake_case through unchanged
// (analysisSchema in analyzer.ts). Auth contracts are in auth.ts.
import { z } from "zod";
import { mapTypeSchema, playerColorSchema } from "./analyzer.ts";
import { usernameSchema } from "./auth.ts";

// GET /api/health
export const healthResponseSchema = z.object({
  status: z.literal("ok"),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

// The body of every error response from the API.
export const apiErrorSchema = z.object({
  message: z.string(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

// Shared by the web app (to reject a file before uploading it) and the
// server (which enforces it).
export const maxReplayFileBytes = 5 * 1024 * 1024;
// The multipart field name, repeated once per uploaded file.
export const replayUploadField = "files";
export const replayPageSize = 20;

// The same values as the CHECK on replays.status in 001_init.sql.
export const replayStatusSchema = z.enum([
  "awaiting_player",
  "queued",
  "processing",
  "processed",
  "failed",
]);
export type ReplayStatus = z.infer<typeof replayStatusSchema>;

export const matchResultSchema = z.enum(["win", "loss"]);
export type MatchResult = z.infer<typeof matchResultSchema>;

// Params for every `/:id` route under /api/replays and /api/matches.
export const replayIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});
export type ReplayIdParams = z.infer<typeof replayIdParamsSchema>;

const slot = z.number().int().min(0).max(3);

// `result` and `defeatedAtTick` are null until the replay is processed. On a
// processed replay, a null `defeatedAtTick` means the player was still
// active at the end.
export const matchPlayerSchema = z.object({
  slot,
  name: z.string(),
  team: z.number().int().min(0).max(3),
  color: playerColorSchema,
  result: matchResultSchema.nullable(),
  defeatedAtTick: z.number().int().nonnegative().nullable(),
});
export type MatchPlayer = z.infer<typeof matchPlayerSchema>;

// One replay, as the list, the match overview, choose-player and accepted
// uploads all return it. Timestamps are ISO strings. The uploader's result
// is the player whose `slot` equals `uploaderSlot`.
export const replaySchema = z.object({
  id: z.number().int().positive(),
  filename: z.string(),
  uploaderUsername: z.string(),
  uploadedAt: z.iso.datetime(),
  processedAt: z.iso.datetime().nullable(),
  mapType: mapTypeSchema,
  replayVersion: z.number().int().nonnegative(),
  durationTicks: z.number().int().nonnegative().nullable(),
  status: replayStatusSchema,
  error: z.string().nullable(),
  uploaderSlot: slot.nullable(),
  players: z.array(matchPlayerSchema),
});
export type Replay = z.infer<typeof replaySchema>;

// POST /api/replays (signed in, multipart, one `files` field per file).
// Answers 200 with one result per file in upload order, even when every
// file is rejected. 400 when the request has no files. An accepted replay
// has status `awaiting_player` and its players from `analyzer header`.
export const uploadResultSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("accepted"),
    filename: z.string(),
    replay: replaySchema,
  }),
  z.object({
    outcome: z.literal("rejected"),
    filename: z.string(),
    reason: z.string(),
  }),
]);
export type UploadResult = z.infer<typeof uploadResultSchema>;

export const uploadResponseSchema = z.object({
  files: z.array(uploadResultSchema),
});
export type UploadResponse = z.infer<typeof uploadResponseSchema>;

// POST /api/replays/:id/player (signed in): the uploader says which player
// they were. Answers the updated replay (now `queued`). 404 when the replay
// doesn't exist or isn't the user's, 409 when it isn't `awaiting_player`,
// 400 when no player has that slot.
export const choosePlayerRequestSchema = z.object({
  slot,
});
export type ChoosePlayerRequest = z.infer<typeof choosePlayerRequestSchema>;

// The list's format filter. Worked out from team sizes, counting bots as
// players: two teams of one is 1v1, two teams of two is 2v2, three or four
// players each on their own team is FFA, and any other layout (2v1, 3v1,
// 2v1v1) is Other. The server's SQL for the filter (findReplayIds in
// apps/server/src/db/replays.ts) follows the same rule.
export const matchFormatSchema = z.enum(["1v1", "2v2", "FFA", "Other"]);
export type MatchFormat = z.infer<typeof matchFormatSchema>;

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

// A text filter matches case-insensitively anywhere in the value. It is
// trimmed, and an empty one counts as unset.
const textFilter = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform((value) => value || undefined);

// An instant, rewritten in the toISOString() format the database stores, so
// the two compare correctly as strings.
const instantFilter = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString())
  .optional();

// GET /api/replays?page=N (public): processed replays from every uploader,
// newest upload first, `replayPageSize` per page. With `mine=true` (signed
// in, 401 otherwise) it lists the user's own replays at every status
// instead. The page maximum keeps the SQL OFFSET a valid integer; a page
// past the end is just empty.
//
// Every other parameter is an optional filter, and a replay must match all
// of them: `uploader` (username), `filename` (original filename) and
// `player` (any in-replay player name) are text filters, `format` is a
// MatchFormat, and `uploadedFrom` (inclusive) and `uploadedBefore`
// (exclusive) bound the upload time. The dates are instants, so the web app
// turns the viewer's local days into them. `user` is the uploader's exact
// username, unlike the `uploader` text filter, so "Kay" doesn't also match
// "Kayin"; the profile's "See all replays" link uses it.
export const replayListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  mine: z.stringbool().default(false),
  uploader: textFilter,
  user: usernameSchema.optional(),
  filename: textFilter,
  player: textFilter,
  format: matchFormatSchema.optional(),
  uploadedFrom: instantFilter,
  uploadedBefore: instantFilter,
});
export type ReplayListQuery = z.infer<typeof replayListQuerySchema>;

export const replayPageSchema = z.object({
  replays: z.array(replaySchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});
export type ReplayPage = z.infer<typeof replayPageSchema>;

// GET /api/users/:username (public): a user's profile. 404 when no user
// has that username. The username isn't checked against the registration
// rules, so a malformed one is a 404 like any other unknown user.
export const usernameParamsSchema = z.object({
  username: z.string(),
});
export type UsernameParams = z.infer<typeof usernameParamsSchema>;

export const profileRecentReplayCount = 5;

// Stats count only the user's processed uploads, and in each only the
// player they said they were. `winRate` is wins ÷ games, from 0 to 1, and
// `averageApm` is the mean of their per-match APM; both are null with no
// games. `recentReplays` are their `profileRecentReplayCount` newest
// processed uploads, newest first.
export const userProfileSchema = z.object({
  username: z.string(),
  games: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  winRate: z.number().min(0).max(1).nullable(),
  averageApm: z.number().nonnegative().nullable(),
  recentReplays: z.array(replaySchema),
});
export type UserProfile = z.infer<typeof userProfileSchema>;

// GET /api/matches/:id (public): answers `replaySchema` at every status, so
// the match page can show a processing state and poll. 404 when missing.
//
// GET /api/matches/:id/analysis (public): answers `analysisSchema` (the
// stored analysis, gunzipped). 404 "Analysis not ready" unless processed.
//
// GET /api/matches/:id/replay (public): the original .rep bytes as
// application/octet-stream, with `Content-Disposition: attachment` using the
// original filename. It isn't JSON, so it has no schema.
