// The job worker, a second entrypoint next to api.ts. It shares the
// database with the API and analyzes the replays the API queues.
import { readConfig } from "./config.ts";
import { openDb } from "./db/connection.ts";
import { startWorker, type WorkerLog } from "./job-runner.ts";

const log: WorkerLog = {
  info: (message) => console.log(`[worker] ${message}`),
  error: (message, error) => console.error(`[worker] ${message}:`, error),
};

const config = readConfig();
const db = openDb(config.dbPath);
const worker = startWorker(db, config.worker, log);
log.info(
  `Started with concurrency ${config.worker.concurrency}, analyzer ${config.worker.analyzerPath}`,
);

// `node --watch` sends SIGTERM before restarting. Running analyses are
// killed, and their jobs are requeued when the worker starts again.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await worker.stop();
    db.close();
    process.exit(0);
  });
}
