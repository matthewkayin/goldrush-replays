import { buildApp } from "./app.ts";
import { readConfig } from "./config.ts";
import { openDb } from "./db/connection.ts";

const HOST = "127.0.0.1";

const config = readConfig();
const db = openDb(config.dbPath);
const app = buildApp({ db, logger: true });

// `node --watch` sends SIGTERM before restarting.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await app.close();
    db.close();
    process.exit(0);
  });
}

await app.listen({ host: HOST, port: config.apiPort });
