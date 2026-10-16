// Sets `request.user` on every request from the session cookie, and provides
// `requireUser` for routes that need a signed-in user:
//
//   app.post("/api/replays", { preHandler: requireUser }, async (request) => {
//     const user = request.user!;
//   });
import cookie from "@fastify/cookie";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type Database from "better-sqlite3";
import type { User } from "@goldrush/shared";
import { findSessionUser } from "../db/sessions.ts";
import { readSessionCookie } from "./session-cookie.ts";

declare module "fastify" {
  interface FastifyRequest {
    // The signed-in user, or null for a visitor.
    user: User | null;
  }
}

// Called by buildApp() on the root instance, so every route module sees
// `request.user`.
export function registerCurrentUser(
  app: FastifyInstance,
  db: Database.Database,
): void {
  app.register(cookie);
  app.decorateRequest("user", null);
  app.addHook("onRequest", async (request) => {
    const token = readSessionCookie(request);
    request.user = token ? findSessionUser(db, token, new Date()) : null;
  });
}

export async function requireUser(request: FastifyRequest): Promise<void> {
  if (!request.user) {
    throw Object.assign(new Error("Sign in required"), { statusCode: 401 });
  }
}
