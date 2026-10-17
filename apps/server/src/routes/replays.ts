// The uploader's side of replays: uploading .rep files, choosing which
// player they were (which queues the analysis), and listing their replays.
// The public match endpoints are in matches.ts.
import multipart from "@fastify/multipart";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type Database from "better-sqlite3";
import {
  choosePlayerRequestSchema,
  maxReplayFileBytes,
  replayIdParamsSchema,
  replayListQuerySchema,
  replayPageSchema,
  replayPageSize,
  replaySchema,
  replayUploadField,
  uploadResponseSchema,
  type ReplayHeader,
  type UploadResult,
} from "@goldrush/shared";
import { readReplayHeader } from "../analyzer.ts";
import type { RouteOptions } from "../app.ts";
import { requireUser } from "../auth/current-user.ts";
import { insertJob } from "../db/jobs.ts";
import { insertMatchPlayers } from "../db/match-players.ts";
import { insertReplayFile } from "../db/replay-files.ts";
import {
  countUserReplays,
  findReplay,
  findReplayOwnership,
  findReplays,
  findUserReplayIds,
  insertReplay,
  setUploaderSlot,
} from "../db/replays.ts";
import { httpError } from "./http-error.ts";

export interface ReplayRouteOptions extends RouteOptions {
  analyzerPath: string;
}

const FILE_TOO_LARGE = `The file is larger than ${maxReplayFileBytes / (1024 * 1024)} MB.`;

export const replayRoutes: FastifyPluginAsyncZod<ReplayRouteOptions> = async (
  app,
  { db, analyzerPath },
) => {
  // A file over the limit is cut short and marked `truncated` instead of
  // failing the request, so the other files can still be accepted.
  await app.register(multipart, {
    limits: { fileSize: maxReplayFileBytes },
    throwFileSizeLimit: false,
  });

  // A replay, its file and its players are stored together or not at all.
  // Called with .immediate(), like every write transaction (see
  // job-runner.ts).
  const storeReplay = db.transaction(
    (userId: number, filename: string, header: ReplayHeader, data: Buffer) => {
      const replayId = insertReplay(db, {
        uploaderUserId: userId,
        filename,
        replayVersion: header.replay_version,
        mapType: header.map_type,
      });
      insertReplayFile(db, replayId, data);
      insertMatchPlayers(db, replayId, header.players);
      return replayId;
    },
  );

  app.post(
    "/api/replays",
    {
      preHandler: requireUser,
      schema: { response: { 200: uploadResponseSchema } },
    },
    async (request) => {
      const userId = request.user!.id;
      if (!request.isMultipart()) {
        throw httpError(400, "No files were uploaded.");
      }

      // Files are read one at a time, in upload order.
      const results: UploadResult[] = [];
      for await (const part of request.files()) {
        const data = await part.toBuffer();
        if (part.fieldname !== replayUploadField) {
          continue;
        }
        const filename = part.filename;
        if (part.file.truncated) {
          results.push({
            outcome: "rejected",
            filename,
            reason: FILE_TOO_LARGE,
          });
          continue;
        }
        const header = await readReplayHeader(analyzerPath, data);
        if (!header.valid) {
          results.push({
            outcome: "rejected",
            filename,
            reason: header.reason,
          });
          continue;
        }
        const replayId = storeReplay.immediate(
          userId,
          filename,
          header.header,
          data,
        );
        results.push({
          outcome: "accepted",
          filename,
          replay: findReplay(db, replayId)!,
        });
      }

      if (results.length === 0) {
        throw httpError(400, "No files were uploaded.");
      }
      return { files: results };
    },
  );

  app.post(
    "/api/replays/:id/player",
    {
      preHandler: requireUser,
      schema: {
        params: replayIdParamsSchema,
        body: choosePlayerRequestSchema,
        response: { 200: replaySchema },
      },
    },
    async (request) => {
      const { id } = request.params;
      const { slot } = request.body;
      choosePlayer(db, request.user!.id, id, slot);
      return findReplay(db, id)!;
    },
  );

  app.get(
    "/api/replays",
    {
      preHandler: requireUser,
      schema: {
        querystring: replayListQuerySchema,
        response: { 200: replayPageSchema },
      },
    },
    async (request) => {
      const userId = request.user!.id;
      const { page } = request.query;
      const ids = findUserReplayIds(
        db,
        userId,
        replayPageSize,
        (page - 1) * replayPageSize,
      );
      return {
        replays: findReplays(db, ids),
        page,
        pageSize: replayPageSize,
        total: countUserReplays(db, userId),
      };
    },
  );
};

// Saves the uploader's slot and queues the analysis, or throws the HTTP
// error that says why it can't. The checks and writes share a transaction,
// so a replay is never queued twice.
function choosePlayer(
  db: Database.Database,
  userId: number,
  replayId: number,
  slot: number,
): void {
  db.transaction(() => {
    const ownership = findReplayOwnership(db, replayId);
    if (!ownership || ownership.uploaderUserId !== userId) {
      throw httpError(404, "Replay not found");
    }
    if (ownership.status !== "awaiting_player") {
      throw httpError(409, "This replay's player has already been chosen");
    }
    const players = findReplay(db, replayId)!.players;
    if (!players.some((player) => player.slot === slot)) {
      throw httpError(400, `No player has slot ${slot}`);
    }
    setUploaderSlot(db, replayId, slot);
    insertJob(db, replayId);
  }).immediate();
}
