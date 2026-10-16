// Checks what every route relies on from buildApp: health, and that every
// kind of error comes back in the shared `{ message }` shape.
import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { apiErrorSchema } from "@goldrush/shared";
import { buildTestApp } from "./helpers.ts";

test("GET /api/health returns ok", async (t) => {
  const app = buildTestApp(t);
  const response = await app.inject({ method: "GET", url: "/api/health" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: "ok" });
});

test("an unknown path returns 404 in the error shape", async (t) => {
  const app = buildTestApp(t);
  const response = await app.inject({ method: "GET", url: "/api/nope" });
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), { message: "Not found" });
});

test("an invalid request body returns 400 in the error shape", async (t) => {
  const app = buildTestApp(t);
  app.post(
    "/api/test/echo",
    { schema: { body: z.object({ name: z.string() }) } },
    async (request) => request.body,
  );

  const response = await app.inject({
    method: "POST",
    url: "/api/test/echo",
    payload: { name: 42 },
  });
  assert.equal(response.statusCode, 400);
  const body = apiErrorSchema.parse(response.json());
  assert.match(body.message, /name/);
});

test("a thrown 4xx error keeps its status and message", async (t) => {
  const app = buildTestApp(t);
  app.get("/api/test/conflict", async () => {
    throw Object.assign(new Error("Username is taken"), { statusCode: 409 });
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/test/conflict",
  });
  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), { message: "Username is taken" });
});

test("an unexpected error returns 500 without its message", async (t) => {
  const app = buildTestApp(t);
  app.get("/api/test/crash", async () => {
    throw new Error("secret internals");
  });

  const response = await app.inject({ method: "GET", url: "/api/test/crash" });
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.json(), { message: "Internal server error" });
});
