// Helpers for tests that upload replays through the API and process them
// with the real analyzer.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  replaySchema,
  replayUploadField,
  uploadResponseSchema,
  type Replay,
} from "@goldrush/shared";
import type { App } from "../src/app.ts";

export const TEST_REPLAYS_DIR = join(
  import.meta.dirname,
  "../../../analyzer/test_replays",
);

// A file from analyzer/test_replays/, e.g. "test_loss.rep" or
// "invalid/bad_signature.rep".
export function readTestReplay(name: string): Buffer {
  return readFileSync(join(TEST_REPLAYS_DIR, name));
}

// The saved `analyzer analyze` output for a test replay, e.g. "test_loss".
export function readExpectedAnalysis(name: string): unknown {
  return JSON.parse(
    readFileSync(join(TEST_REPLAYS_DIR, `${name}.analysis.json`), "utf8"),
  );
}

export interface UploadFile {
  filename: string;
  data: Buffer;
  // Defaults to the field the API reads, replayUploadField.
  field?: string;
}

// POST /api/replays with these files as a multipart body.
export async function postReplays(
  app: App,
  token: string | undefined,
  files: UploadFile[],
) {
  const form = new FormData();
  for (const { filename, data, field } of files) {
    form.append(field ?? replayUploadField, new Blob([data]), filename);
  }
  // Request encodes the form and picks the multipart boundary.
  const request = new Request("http://localhost/", {
    method: "POST",
    body: form,
  });
  return app.inject({
    method: "POST",
    url: "/api/replays",
    headers: { "content-type": request.headers.get("content-type")! },
    payload: Buffer.from(await request.arrayBuffer()),
    cookies: token === undefined ? {} : { session: token },
  });
}

// Uploads one test replay, which must be accepted, and returns it.
export async function uploadTestReplay(
  app: App,
  token: string,
  name: string,
): Promise<Replay> {
  const response = await postReplays(app, token, [
    { filename: name, data: readTestReplay(name) },
  ]);
  assert.equal(response.statusCode, 200, response.body);
  const [result] = uploadResponseSchema.parse(response.json()).files;
  assert.ok(result?.outcome === "accepted", response.body);
  return result.replay;
}

export function choosePlayer(
  app: App,
  token: string | undefined,
  replayId: number,
  slot: unknown,
) {
  return app.inject({
    method: "POST",
    url: `/api/replays/${replayId}/player`,
    payload: { slot },
    cookies: token === undefined ? {} : { session: token },
  });
}

// Uploads a test replay and chooses the uploader's slot, so it's queued for
// the worker.
export async function queueTestReplay(
  app: App,
  token: string,
  name: string,
  slot: number,
): Promise<Replay> {
  const uploaded = await uploadTestReplay(app, token, name);
  const response = await choosePlayer(app, token, uploaded.id, slot);
  assert.equal(response.statusCode, 200, response.body);
  return replaySchema.parse(response.json());
}
