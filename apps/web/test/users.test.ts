// Checks the profile page's API call and how its stats are shown.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { UserProfile } from "@goldrush/shared";
import { ApiError } from "../src/api/client.ts";
import { fetchProfile } from "../src/api/users.ts";
import {
  formatAverageApm,
  formatWinRate,
  profilePath,
} from "../src/pages/profile/profile-display.ts";
import { stubFetch } from "./stub-fetch.ts";

const profile: UserProfile = {
  username: "Kayin",
  games: 3,
  wins: 2,
  losses: 1,
  winRate: 2 / 3,
  averageApm: 41.25,
  recentReplays: [],
};

test("fetchProfile gets and parses the user's profile", async (t) => {
  const requests = stubFetch(t, Response.json(profile));
  assert.deepEqual(await fetchProfile("Kayin"), profile);
  assert.equal(requests[0]!.method, "GET");
  assert.equal(new URL(requests[0]!.url).pathname, "/api/users/Kayin");
});

test("fetchProfile passes on 'User not found'", async (t) => {
  stubFetch(t, Response.json({ message: "User not found" }, { status: 404 }));
  await assert.rejects(
    fetchProfile("nobody"),
    new ApiError(404, "User not found"),
  );
});

test("a username in a path is encoded, so any URL typed in stays one path segment", async (t) => {
  const requests = stubFetch(
    t,
    Response.json({ message: "User not found" }, { status: 404 }),
  );
  await assert.rejects(fetchProfile("a/b?c"));
  assert.equal(new URL(requests[0]!.url).pathname, "/api/users/a%2Fb%3Fc");
  assert.equal(profilePath("Kayin"), "/users/Kayin");
});

test("win rate is a whole percent and APM has one decimal, both — with no games", () => {
  assert.equal(formatWinRate(2 / 3), "67%");
  assert.equal(formatWinRate(0), "0%");
  assert.equal(formatWinRate(1), "100%");
  assert.equal(formatWinRate(null), "—");
  assert.equal(formatAverageApm(41.25), "41.3");
  assert.equal(formatAverageApm(40), "40.0");
  assert.equal(formatAverageApm(null), "—");
});
