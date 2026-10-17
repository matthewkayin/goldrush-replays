import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import type Database from "better-sqlite3";
import type { LightMyRequestResponse } from "fastify";
import { authResponseSchema, type User } from "@goldrush/shared";
import { buildApp, type App } from "../src/app.ts";
import { SESSION_COOKIE } from "../src/auth/session-cookie.ts";
import { DEFAULT_ANALYZER_PATH } from "../src/config.ts";
import { openDb } from "../src/db/connection.ts";

// The real app on a fresh in-memory database, closed when the test ends.
// Call it with app.inject().
export function buildTestApp(t: TestContext): App {
  return buildTestAppWithDb(t).app;
}

// Like buildTestApp, plus the database, for tests that check or set up rows
// directly.
export function buildTestAppWithDb(t: TestContext): {
  app: App;
  db: Database.Database;
} {
  const db = openDb(":memory:");
  const app = buildApp({
    db,
    logger: false,
    analyzerPath: DEFAULT_ANALYZER_PATH,
  });
  t.after(async () => {
    await app.close();
    db.close();
  });
  return { app, db };
}

// The value of the session cookie a response set, e.g. from register or
// sign-in. Fails the test if there isn't one.
export function sessionCookie(response: LightMyRequestResponse): string {
  const cookie = response.cookies.find(({ name }) => name === SESSION_COOKIE);
  assert.ok(cookie, "response should set the session cookie");
  return cookie.value;
}

// Registers an account and returns it with its session cookie, ready to
// pass to app.inject() as `cookies: { session: token }`.
export async function registerUser(
  app: App,
  username = "stew",
  password = "goldrush123",
): Promise<{ user: User; token: string }> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { username, password },
  });
  assert.equal(response.statusCode, 201, response.body);
  const { user } = authResponseSchema.parse(response.json());
  return { user, token: sessionCookie(response) };
}
