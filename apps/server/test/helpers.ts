import type { TestContext } from "node:test";
import { buildApp, type App } from "../src/app.ts";
import { openDb } from "../src/db/connection.ts";

// The real app on a fresh in-memory database, closed when the test ends.
// Call it with app.inject().
export function buildTestApp(t: TestContext): App {
  const db = openDb(":memory:");
  const app = buildApp({ db, logger: false });
  t.after(async () => {
    await app.close();
    db.close();
  });
  return app;
}
