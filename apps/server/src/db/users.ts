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

export interface ProfileStats {
  games: number;
  wins: number;
  losses: number;
  // The mean of the user's per-match APM, or null with no games.
  averageApm: number | null;
}

// A profile's stats: only the user's processed uploads, and in each only
// the player they said they were (slot = uploader_slot).
export function findProfileStats(
  db: Database.Database,
  userId: number,
): ProfileStats {
  return db
    .prepare<[number], ProfileStats>(
      `SELECT count(*) AS games,
              coalesce(sum(match_players.result = 'win'), 0) AS wins,
              coalesce(sum(match_players.result = 'loss'), 0) AS losses,
              avg(match_players.apm) AS averageApm
       FROM replays JOIN match_players
         ON match_players.replay_id = replays.id
        AND match_players.slot = replays.uploader_slot
       WHERE replays.uploader_user_id = ? AND replays.status = 'processed'`,
    )
    .get(userId)!;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}
