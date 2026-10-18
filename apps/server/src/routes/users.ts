// Public user profiles: a user's stats and their newest processed replays.
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import {
  profileRecentReplayCount,
  userProfileSchema,
  usernameParamsSchema,
} from "@goldrush/shared";
import type { RouteOptions } from "../app.ts";
import { findReplayIds, findReplays } from "../db/replays.ts";
import { findProfileStats, findUserByUsername } from "../db/users.ts";
import { httpError } from "./http-error.ts";

export const userRoutes: FastifyPluginAsyncZod<RouteOptions> = async (
  app,
  { db },
) => {
  app.get(
    "/api/users/:username",
    {
      schema: {
        params: usernameParamsSchema,
        response: { 200: userProfileSchema },
      },
    },
    async (request) => {
      const user = findUserByUsername(db, request.params.username);
      if (!user) {
        throw httpError(404, "User not found");
      }
      const stats = findProfileStats(db, user.id);
      const recentIds = findReplayIds(
        db,
        { userId: null, user: user.username },
        profileRecentReplayCount,
        0,
      );
      return {
        username: user.username,
        ...stats,
        winRate: stats.games === 0 ? null : stats.wins / stats.games,
        recentReplays: findReplays(db, recentIds),
      };
    },
  );
};
