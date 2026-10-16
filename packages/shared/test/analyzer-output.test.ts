// Checks that the analyzer's saved expected output still matches the shared
// schemas, so a change to the analyzer's JSON can't drift away from the types
// the server and web app use. Regenerate the expected files with
// analyzer/tests/update_expected.sh.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import type { z } from "zod";
import { analysisSchema, replayHeaderSchema } from "../src/index.ts";

const replaysDir = new URL("../../../analyzer/test_replays/", import.meta.url);

function expectedFiles(suffix: string): string[] {
  const files = readdirSync(replaysDir).filter((file) => file.endsWith(suffix));
  assert.notEqual(files.length, 0, `no *${suffix} files in ${replaysDir}`);
  return files;
}

function checkFile(file: string, schema: z.ZodType): void {
  const json: unknown = JSON.parse(
    readFileSync(new URL(file, replaysDir), "utf8"),
  );
  const result = schema.safeParse(json);
  assert.ok(result.success, `${file}: ${result.error?.message}`);
}

for (const file of expectedFiles(".header.json")) {
  test(`${file} matches replayHeaderSchema`, () => {
    checkFile(file, replayHeaderSchema);
  });
}

for (const file of expectedFiles(".analysis.json")) {
  test(`${file} matches analysisSchema`, () => {
    checkFile(file, analysisSchema);
  });
}
