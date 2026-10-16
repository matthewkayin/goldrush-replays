// Queries on the sessions table. The cookie holds a random token, and the
// table stores only its SHA-256, so a copy of the database can't be used to
// sign in as anyone.
import { createHash, randomBytes } from "node:crypto";
import type Database from "better-sqlite3";
import type { User } from "@goldrush/shared";

// Sessions last 30 days from sign-in. Using the site doesn't extend them.
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export interface NewSession {
  token: string;
  expiresAt: Date;
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createSession(
  db: Database.Database,
  userId: number,
  now: Date,
): NewSession {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);
  db.prepare(
    "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
  ).run(hashSessionToken(token), userId, expiresAt.toISOString());
  return { token, expiresAt };
}

// The user a session token belongs to, or null if the session doesn't exist
// or has expired.
export function findSessionUser(
  db: Database.Database,
  token: string,
  now: Date,
): User | null {
  const row = db
    .prepare<[string, string], User>(
      `SELECT users.id, users.username
       FROM sessions JOIN users ON users.id = sessions.user_id
       WHERE sessions.id = ? AND sessions.expires_at > ?`,
    )
    .get(hashSessionToken(token), now.toISOString());
  return row ?? null;
}

export function deleteSession(db: Database.Database, token: string): void {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(hashSessionToken(token));
}

export function deleteExpiredSessions(db: Database.Database, now: Date): void {
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(
    now.toISOString(),
  );
}
