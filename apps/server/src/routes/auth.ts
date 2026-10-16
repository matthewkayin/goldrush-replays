import type { FastifyReply } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type Database from "better-sqlite3";
import {
  authResponseSchema,
  currentUserResponseSchema,
  registerRequestSchema,
  signInRequestSchema,
  type User,
} from "@goldrush/shared";
import type { RouteOptions } from "../app.ts";
import { hashPassword, verifyPassword } from "../auth/passwords.ts";
import {
  clearSessionCookie,
  readSessionCookie,
  setSessionCookie,
} from "../auth/session-cookie.ts";
import {
  createSession,
  deleteExpiredSessions,
  deleteSession,
} from "../db/sessions.ts";
import { createUser, findUserByUsername } from "../db/users.ts";

function httpError(statusCode: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode });
}

// Sign-in checks a password against this when the username doesn't exist,
// so an unknown username takes as long to reject as a wrong password.
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword("not a real password");
  return dummyHash;
}

function startSession(
  db: Database.Database,
  reply: FastifyReply,
  user: User,
): void {
  const now = new Date();
  deleteExpiredSessions(db, now);
  const session = createSession(db, user.id, now);
  setSessionCookie(reply, session.token);
}

export const authRoutes: FastifyPluginAsyncZod<RouteOptions> = async (
  app,
  { db },
) => {
  app.post(
    "/api/auth/register",
    {
      schema: {
        body: registerRequestSchema,
        response: { 201: authResponseSchema },
      },
    },
    async (request, reply) => {
      const { username, password } = request.body;
      const user = createUser(db, username, await hashPassword(password));
      if (!user) {
        throw httpError(409, "Username is taken");
      }
      startSession(db, reply, user);
      return reply.status(201).send({ user });
    },
  );

  app.post(
    "/api/auth/login",
    {
      schema: {
        body: signInRequestSchema,
        response: { 200: authResponseSchema },
      },
    },
    async (request, reply) => {
      const { username, password } = request.body;
      const found = findUserByUsername(db, username);
      const passwordMatches = await verifyPassword(
        found?.passwordHash ?? (await getDummyHash()),
        password,
      );
      if (!found || !passwordMatches) {
        throw httpError(401, "Invalid username or password");
      }
      const user = { id: found.id, username: found.username };
      startSession(db, reply, user);
      return { user };
    },
  );

  // Safe to call when already signed out.
  app.post(
    "/api/auth/logout",
    { schema: { response: { 200: currentUserResponseSchema } } },
    async (request, reply) => {
      const token = readSessionCookie(request);
      if (token) {
        deleteSession(db, token);
      }
      clearSessionCookie(reply);
      return { user: null };
    },
  );

  // Answers 200 for visitors too, so checking who is signed in is never an
  // error.
  app.get(
    "/api/auth/me",
    { schema: { response: { 200: currentUserResponseSchema } } },
    async (request) => {
      return { user: request.user };
    },
  );
};
