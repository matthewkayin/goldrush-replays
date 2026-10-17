// Settings read from the environment once at startup. The overrides let a
// second checkout (e.g. a git worktree) run alongside the main one.
import { join } from "node:path";
import { DEFAULT_DB_PATH } from "./db/connection.ts";

// Resolved from this file rather than the cwd, so it works whichever
// directory the API or worker is started from.
export const DEFAULT_ANALYZER_PATH = join(
  import.meta.dirname,
  "../../../analyzer/build/analyzer",
);

export interface WorkerConfig {
  analyzerPath: string;
  // How many replays are analyzed at once.
  concurrency: number;
  pollIntervalMs: number;
  // `analyzer analyze` is killed after this long. The 41-minute test replay
  // takes about 42 s.
  analyzeTimeoutMs: number;
  // A job that fails this many times marks its replay `failed`.
  maxAttempts: number;
}

export interface Config {
  apiPort: number;
  dbPath: string;
  analyzerPath: string;
  worker: WorkerConfig;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const analyzerPath = env.ANALYZER_PATH ?? DEFAULT_ANALYZER_PATH;
  return {
    apiPort: Number(env.API_PORT ?? 3000),
    dbPath: env.DB_PATH ?? DEFAULT_DB_PATH,
    analyzerPath,
    worker: {
      analyzerPath,
      concurrency: positiveInt("WORKER_CONCURRENCY", env.WORKER_CONCURRENCY, 2),
      pollIntervalMs: 1000,
      analyzeTimeoutMs: 120_000,
      maxAttempts: 3,
    },
  };
}

// A typo would otherwise give NaN, and a worker that silently never claims a
// job.
function positiveInt(
  name: string,
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined) {
    return fallback;
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(
      `${name} must be a whole number of at least 1, not "${value}"`,
    );
  }
  return number;
}
