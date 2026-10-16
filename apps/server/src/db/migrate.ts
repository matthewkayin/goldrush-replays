// Applies the numbered migration files in apps/server/sql/ (001_init.sql,
// 002_...) in order. The number of the last applied file is stored in
// PRAGMA user_version, so each file runs exactly once per database.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Database } from "better-sqlite3";

const MIGRATION_FILE = /^(\d{3})_.+\.sql$/;

interface Migration {
  version: number;
  path: string;
}

function listMigrations(sqlDir: string): Migration[] {
  const migrations = readdirSync(sqlDir)
    .map((name) => ({ name, match: MIGRATION_FILE.exec(name) }))
    .filter(({ match }) => match !== null)
    .map(({ name, match }) => ({
      version: Number(match![1]),
      path: join(sqlDir, name),
    }))
    .sort((a, b) => a.version - b.version);

  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error(
        `Migrations in ${sqlDir} must be numbered 001, 002, ... with no gaps or duplicates; found ${migration.path}`,
      );
    }
  });
  return migrations;
}

export function migrate(db: Database, sqlDir: string): void {
  const migrations = listMigrations(sqlDir);
  const currentVersion = db.pragma("user_version", { simple: true }) as number;
  if (currentVersion > migrations.length) {
    throw new Error(
      `Database is at version ${currentVersion}, but ${sqlDir} only goes up to ${migrations.length}`,
    );
  }

  for (const migration of migrations.slice(currentVersion)) {
    const sql = readFileSync(migration.path, "utf8");
    db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${migration.version}`);
    })();
  }
}
