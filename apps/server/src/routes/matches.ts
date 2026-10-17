// The public match endpoints: the replay overview at any status, its
// analysis once processed, and the original replay file.
import { gunzipSync } from "node:zlib";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import {
  analysisSchema,
  replayIdParamsSchema,
  replaySchema,
} from "@goldrush/shared";
import type { RouteOptions } from "../app.ts";
import { findGzippedAnalysis } from "../db/replay-analyses.ts";
import { findReplayFile } from "../db/replay-files.ts";
import { findReplay } from "../db/replays.ts";
import { httpError } from "./http-error.ts";

const replayNotFound = "Replay not found";

// A `Content-Disposition` header that downloads the file under `filename`.
// `filename` is a plain ASCII fallback with anything unsafe replaced by `_`;
// `filename*` (RFC 6266) carries the exact name, percent-encoded as UTF-8.
export function attachmentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]|["\\%]/g, "_");
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export const matchRoutes: FastifyPluginAsyncZod<RouteOptions> = async (
  app,
  { db },
) => {
  app.get(
    "/api/matches/:id",
    {
      schema: {
        params: replayIdParamsSchema,
        response: { 200: replaySchema },
      },
    },
    async (request) => {
      const replay = findReplay(db, request.params.id);
      if (!replay) {
        throw httpError(404, replayNotFound);
      }
      return replay;
    },
  );

  // The analyzer's snake_case JSON, passed through unchanged. The response
  // schema checks it on the way out.
  app.get(
    "/api/matches/:id/analysis",
    {
      schema: {
        params: replayIdParamsSchema,
        response: { 200: analysisSchema },
      },
    },
    async (request) => {
      const replay = findReplay(db, request.params.id);
      if (!replay) {
        throw httpError(404, replayNotFound);
      }
      const gzipped =
        replay.status === "processed"
          ? findGzippedAnalysis(db, replay.id)
          : null;
      if (!gzipped) {
        throw httpError(404, "Analysis not ready");
      }
      return JSON.parse(gunzipSync(gzipped).toString("utf8"));
    },
  );

  // Raw bytes, not JSON, so the 200 response has no schema.
  app.get(
    "/api/matches/:id/replay",
    { schema: { params: replayIdParamsSchema } },
    async (request, reply) => {
      const replay = findReplay(db, request.params.id);
      const data = replay && findReplayFile(db, replay.id);
      if (!replay || !data) {
        throw httpError(404, replayNotFound);
      }
      return reply
        .header("Content-Type", "application/octet-stream")
        .header("Content-Disposition", attachmentDisposition(replay.filename))
        .send(data);
    },
  );
};
