// Checks running the real analyzer as a child process: header results for
// valid and invalid replays, and analyze's timeout and abort.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  AnalyzerError,
  analyzeReplay,
  readReplayHeader,
} from "../src/analyzer.ts";
import { DEFAULT_ANALYZER_PATH } from "../src/config.ts";
import {
  TEST_REPLAYS_DIR,
  readExpectedAnalysis,
  readTestReplay,
} from "./replay-helpers.ts";

for (const name of [
  "test_ffa",
  "test_team",
  "test_loss",
  "test_victory_long",
]) {
  test(`header of ${name}.rep matches its expected file`, async () => {
    const result = await readReplayHeader(
      DEFAULT_ANALYZER_PATH,
      readTestReplay(`${name}.rep`),
    );
    const expected = JSON.parse(
      readFileSync(join(TEST_REPLAYS_DIR, `${name}.header.json`), "utf8"),
    );
    assert.deepEqual(result, { valid: true, header: expected });
  });
}

test("invalid replays come back with the analyzer's reason", async () => {
  const reasons: Record<string, string> = {
    "bad_signature.rep": "Not a Gold Rush replay (bad signature).",
    "unknown_version.rep": "Unsupported replay version 1.",
    "truncated_header.rep": "Replay file is truncated.",
    "truncated_entries.rep": "Replay file is truncated.",
  };
  for (const [file, reason] of Object.entries(reasons)) {
    const result = await readReplayHeader(
      DEFAULT_ANALYZER_PATH,
      readTestReplay(`invalid/${file}`),
    );
    assert.deepEqual(result, { valid: false, reason }, file);
  }
  assert.deepEqual(
    await readReplayHeader(DEFAULT_ANALYZER_PATH, Buffer.alloc(0)),
    { valid: false, reason: "Replay file is truncated." },
  );
});

test("a missing analyzer binary is an error, not an invalid replay", async () => {
  await assert.rejects(
    readReplayHeader("/nonexistent/analyzer", readTestReplay("test_loss.rep")),
    (error: NodeJS.ErrnoException) => error.code === "ENOENT",
  );
});

test("analyze matches the expected analysis of test_loss.rep", async () => {
  const analysis = await analyzeReplay(
    DEFAULT_ANALYZER_PATH,
    readTestReplay("test_loss.rep"),
    { timeoutMs: 60_000 },
  );
  assert.deepEqual(analysis, readExpectedAnalysis("test_loss"));
});

test("analyze is killed when it runs past its timeout", async () => {
  await assert.rejects(
    analyzeReplay(DEFAULT_ANALYZER_PATH, readTestReplay("test_loss.rep"), {
      timeoutMs: 50,
    }),
    (error) =>
      error instanceof AnalyzerError &&
      error.message === "The analyzer timed out after 0.05 s.",
  );
});

test("analyze is killed when its signal is aborted", async () => {
  const controller = new AbortController();
  const running = analyzeReplay(
    DEFAULT_ANALYZER_PATH,
    readTestReplay("test_loss.rep"),
    { timeoutMs: 60_000, signal: controller.signal },
  );
  controller.abort();
  await assert.rejects(
    running,
    (error) => error instanceof Error && error.name === "AbortError",
  );
});
