// Checks the "Create an account and sign in" story through the HTTP API:
// register, sign in, sign out, the session cookie, and requireUser.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  apiErrorSchema,
  authResponseSchema,
  currentUserResponseSchema,
} from "@goldrush/shared";
import type { App } from "../src/app.ts";
import { requireUser } from "../src/auth/current-user.ts";
import { hashSessionToken } from "../src/db/sessions.ts";
import {
  buildTestApp,
  buildTestAppWithDb,
  registerUser,
  sessionCookie,
} from "./helpers.ts";

async function currentUser(app: App, token?: string) {
  const response = await app.inject({
    method: "GET",
    url: "/api/auth/me",
    cookies: token === undefined ? {} : { session: token },
  });
  assert.equal(response.statusCode, 200);
  return currentUserResponseSchema.parse(response.json()).user;
}

function signIn(app: App, username: string, password: string) {
  return app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username, password },
  });
}

test("registering creates the account and signs the user in", async (t) => {
  const app = buildTestApp(t);
  const { user, token } = await registerUser(app, "stew", "goldrush123");
  assert.equal(user.username, "stew");
  assert.deepEqual(await currentUser(app, token), user);
});

test("the session cookie is httpOnly, SameSite=Lax and lasts 30 days", async (t) => {
  const app = buildTestApp(t);
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { username: "stew", password: "goldrush123" },
  });
  const cookie = response.cookies.find(({ name }) => name === "session");
  assert.ok(cookie);
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, "Lax");
  assert.equal(cookie.path, "/");
  assert.equal(cookie.maxAge, 30 * 24 * 60 * 60);
});

test("the database stores an argon2id hash and the token's SHA-256, never the secrets", async (t) => {
  const { app, db } = buildTestAppWithDb(t);
  const { user, token } = await registerUser(app, "stew", "goldrush123");

  const { password_hash } = db
    .prepare<[number], { password_hash: string }>(
      "SELECT password_hash FROM users WHERE id = ?",
    )
    .get(user.id)!;
  assert.match(password_hash, /^\$argon2id\$/);

  const sessionIds = db
    .prepare<[number], { id: string }>(
      "SELECT id FROM sessions WHERE user_id = ?",
    )
    .all(user.id)
    .map(({ id }) => id);
  assert.deepEqual(sessionIds, [hashSessionToken(token)]);
});

test("a taken username is rejected with 409", async (t) => {
  const app = buildTestApp(t);
  await registerUser(app, "stew");
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { username: "stew", password: "different123" },
  });
  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), { message: "Username is taken" });
});

test("usernames are case-sensitive", async (t) => {
  const app = buildTestApp(t);
  await registerUser(app, "stew");
  await registerUser(app, "Stew");
});

test("registration rejects a short password or a bad username with 400", async (t) => {
  const app = buildTestApp(t);
  for (const payload of [
    { username: "stew", password: "short12" },
    { username: "st", password: "goldrush123" },
    { username: "a".repeat(21), password: "goldrush123" },
    { username: "stew pot", password: "goldrush123" },
  ]) {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload,
    });
    assert.equal(response.statusCode, 400, JSON.stringify(payload));
    apiErrorSchema.parse(response.json());
  }
});

test("signing in with valid credentials sets a new session cookie", async (t) => {
  const app = buildTestApp(t);
  const { user, token: registerToken } = await registerUser(
    app,
    "stew",
    "goldrush123",
  );

  const response = await signIn(app, "stew", "goldrush123");
  assert.equal(response.statusCode, 200);
  assert.deepEqual(authResponseSchema.parse(response.json()).user, user);
  const token = sessionCookie(response);
  assert.notEqual(token, registerToken);
  assert.deepEqual(await currentUser(app, token), user);
});

test("a wrong password and an unknown username get the same 401", async (t) => {
  const app = buildTestApp(t);
  await registerUser(app, "stew", "goldrush123");

  for (const [username, password] of [
    ["stew", "wrongpassword"],
    ["nobody", "goldrush123"],
  ] as const) {
    const response = await signIn(app, username, password);
    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), {
      message: "Invalid username or password",
    });
    assert.equal(response.cookies.length, 0);
  }
});

test("signing out deletes the session on the server", async (t) => {
  const { app, db } = buildTestAppWithDb(t);
  const { token } = await registerUser(app);

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/logout",
    cookies: { session: token },
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { user: null });
  const cleared = response.cookies.find(({ name }) => name === "session");
  assert.equal(cleared?.value, "");

  const { n } = db
    .prepare<[], { n: number }>("SELECT count(*) AS n FROM sessions")
    .get()!;
  assert.equal(n, 0);
  // The old cookie no longer works, even if the browser kept it.
  assert.equal(await currentUser(app, token), null);
});

test("signing out without a session is fine", async (t) => {
  const app = buildTestApp(t);
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/logout",
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { user: null });
});

test("a visitor, an unknown token and an expired session are all signed out", async (t) => {
  const { app, db } = buildTestAppWithDb(t);
  const { token } = await registerUser(app);

  assert.equal(await currentUser(app), null);
  assert.equal(await currentUser(app, "not-a-real-token"), null);

  db.prepare("UPDATE sessions SET expires_at = ? WHERE id = ?").run(
    new Date(Date.now() - 1000).toISOString(),
    hashSessionToken(token),
  );
  assert.equal(await currentUser(app, token), null);
});

test("signing in deletes expired sessions", async (t) => {
  const { app, db } = buildTestAppWithDb(t);
  await registerUser(app, "stew", "goldrush123");
  db.prepare("UPDATE sessions SET expires_at = ?").run(
    new Date(Date.now() - 1000).toISOString(),
  );

  const token = sessionCookie(await signIn(app, "stew", "goldrush123"));
  const ids = db
    .prepare<[], { id: string }>("SELECT id FROM sessions")
    .all()
    .map(({ id }) => id);
  assert.deepEqual(ids, [hashSessionToken(token)]);
});

test("requireUser rejects visitors with 401 and lets signed-in users through", async (t) => {
  const app = buildTestApp(t);
  app.get("/api/test/private", { preHandler: requireUser }, async (request) => {
    return { username: request.user!.username };
  });
  const { token } = await registerUser(app, "stew");

  const visitor = await app.inject({ method: "GET", url: "/api/test/private" });
  assert.equal(visitor.statusCode, 401);
  assert.deepEqual(visitor.json(), { message: "Sign in required" });

  const signedIn = await app.inject({
    method: "GET",
    url: "/api/test/private",
    cookies: { session: token },
  });
  assert.equal(signedIn.statusCode, 200);
  assert.deepEqual(signedIn.json(), { username: "stew" });
});
