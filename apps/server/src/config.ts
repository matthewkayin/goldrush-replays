// Settings read from the environment once at startup. The overrides let a
// second checkout (e.g. a git worktree) run alongside the main one.
import { DEFAULT_DB_PATH } from "./db/connection.ts";

export interface Config {
  apiPort: number;
  dbPath: string;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    apiPort: Number(env.API_PORT ?? 3000),
    dbPath: env.DB_PATH ?? DEFAULT_DB_PATH,
  };
}
