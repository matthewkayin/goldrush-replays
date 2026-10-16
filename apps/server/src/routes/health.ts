import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { healthResponseSchema } from "@goldrush/shared";
import type { RouteOptions } from "../app.ts";

export const healthRoutes: FastifyPluginAsyncZod<RouteOptions> = async (
  app,
) => {
  app.get(
    "/api/health",
    {
      schema: { response: { 200: healthResponseSchema } },
    },
    async () => {
      return { status: "ok" as const };
    },
  );
};
