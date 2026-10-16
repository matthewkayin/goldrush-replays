// Checks the auth API calls the sign-in pages and header rely on, and the
// `?next=` handling that decides where sign-in returns to.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fetchCurrentUser,
  register,
  signIn,
  signOut,
} from "../src/api/auth.ts";
import { authPagePath, safeNextPath } from "../src/api/next-path.ts";
import { stubFetch } from "./stub-fetch.ts";

const stew = { id: 1, username: "stew" };

test("register posts the credentials and returns the user", async (t) => {
  const requests = stubFetch(t, Response.json({ user: stew }, { status: 201 }));
  const user = await register({ username: "stew", password: "goldrush123" });
  assert.deepEqual(user, stew);
  assert.equal(requests[0]!.method, "POST");
  assert.equal(new URL(requests[0]!.url).pathname, "/api/auth/register");
  assert.deepEqual(await requests[0]!.json(), {
    username: "stew",
    password: "goldrush123",
  });
});

test("signIn posts to /api/auth/login and returns the user", async (t) => {
  const requests = stubFetch(t, Response.json({ user: stew }));
  assert.deepEqual(
    await signIn({ username: "stew", password: "goldrush123" }),
    stew,
  );
  assert.equal(new URL(requests[0]!.url).pathname, "/api/auth/login");
});

test("signOut posts to /api/auth/logout", async (t) => {
  const requests = stubFetch(t, Response.json({ user: null }));
  await signOut();
  assert.equal(requests[0]!.method, "POST");
  assert.equal(new URL(requests[0]!.url).pathname, "/api/auth/logout");
});

test("fetchCurrentUser returns the user, or null for a visitor", async (t) => {
  stubFetch(t, Response.json({ user: stew }));
  assert.deepEqual(await fetchCurrentUser(), stew);

  t.mock.restoreAll();
  stubFetch(t, Response.json({ user: null }));
  assert.equal(await fetchCurrentUser(), null);
});

test("safeNextPath keeps same-site paths and replaces anything else with /", () => {
  assert.equal(safeNextPath("/replays?page=2"), "/replays?page=2");
  assert.equal(safeNextPath(null), "/");
  assert.equal(safeNextPath(""), "/");
  assert.equal(safeNextPath("https://evil.example"), "/");
  assert.equal(safeNextPath("//evil.example"), "/");
  assert.equal(safeNextPath("/\\evil.example"), "/");
});

test("authPagePath adds ?next= only when it isn't the home page", () => {
  assert.equal(authPagePath("/sign-in", "/"), "/sign-in");
  assert.equal(
    authPagePath("/register", "/replays?page=2"),
    "/register?next=%2Freplays%3Fpage%3D2",
  );
});
