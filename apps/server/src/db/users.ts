// Queries on the users table.
import type Database from "better-sqlite3";
import type { User } from "@goldrush/shared";

export interface UserWithPasswordHash extends User {
  passwordHash: string;
}

// Returns null if the username is already taken.
export function createUser(
  db: Database.Database,
  username: string,
  passwordHash: string,
): User | null {
  try {
    const result = db
      .prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)")
      .run(username, passwordHash);
    return { id: Number(result.lastInsertRowid), username };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return null;
    }
    throw error;
  }
}

export function findUserByUsername(
  db: Database.Database,
  username: string,
): UserWithPasswordHash | null {
  const row = db
    .prepare<[string], UserWithPasswordHash>(
      "SELECT id, username, password_hash AS passwordHash FROM users WHERE username = ?",
    )
    .get(username);
  return row ?? null;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}
