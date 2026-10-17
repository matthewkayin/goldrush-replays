// Checks the settings read from the environment, in particular that a bad
// worker setting stops startup instead of leaving a worker that never runs.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readConfig } from "../src/config.ts";

test("worker concurrency defaults to 2 and can be overridden", () => {
  assert.equal(readConfig({}).worker.concurrency, 2);
  assert.equal(readConfig({ WORKER_CONCURRENCY: "4" }).worker.concurrency, 4);
});

test("a worker concurrency that isn't a whole number of at least 1 is an error", () => {
  for (const value of ["two", "", "0", "-1", "1.5"]) {
    assert.throws(
      () => readConfig({ WORKER_CONCURRENCY: value }),
      /WORKER_CONCURRENCY/,
      value,
    );
  }
});
