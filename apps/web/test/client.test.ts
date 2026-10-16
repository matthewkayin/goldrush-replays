// Checks how the API client turns responses into values or ApiErrors, since
// every page relies on it to show server errors.
import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { ApiError, apiGet, apiPost } from "../src/api/client.ts";
import { stubFetch } from "./stub-fetch.ts";

const thingSchema = z.object({ name: z.string() });

test("parses a successful response with the schema", async (t) => {
  stubFetch(t, Response.json({ name: "stew" }));
  assert.deepEqual(await apiGet("/api/thing", thingSchema), { name: "stew" });
});

test("rejects a successful response that doesn't match the schema", async (t) => {
  stubFetch(t, Response.json({ name: 42 }));
  await assert.rejects(apiGet("/api/thing", thingSchema), z.ZodError);
});

test("sends a plain object as JSON", async (t) => {
  const requests = stubFetch(t, Response.json({ name: "stew" }));
  await apiPost("/api/thing", { name: "stew" }, thingSchema);
  assert.equal(requests[0]!.method, "POST");
  assert.equal(requests[0]!.headers.get("content-type"), "application/json");
  assert.deepEqual(await requests[0]!.json(), { name: "stew" });
});

test("turns an error response into an ApiError with its message", async (t) => {
  stubFetch(
    t,
    Response.json({ message: "Username is taken" }, { status: 409 }),
  );
  await assert.rejects(
    apiPost("/api/thing", {}, thingSchema),
    new ApiError(409, "Username is taken"),
  );
});

test("falls back to a generic message when the error body isn't JSON", async (t) => {
  stubFetch(t, new Response("Bad gateway", { status: 502 }));
  await assert.rejects(
    apiGet("/api/thing", thingSchema),
    new ApiError(502, "Request failed (502)"),
  );
});
