-- The whole Release 1 schema, including what the "Later" features need.
-- Timestamps are ISO-8601 TEXT in the format JS toISOString() writes
-- (YYYY-MM-DDTHH:MM:SS.sssZ), so they compare and sort as strings.

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,      -- case-sensitive
  password_hash TEXT NOT NULL,             -- argon2id encoded string
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,             -- SHA-256 hex of the cookie token
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL
) STRICT;
CREATE INDEX sessions_user_id ON sessions(user_id);
CREATE INDEX sessions_expires_at ON sessions(expires_at);

CREATE TABLE replays (
  id                INTEGER PRIMARY KEY,
  uploader_user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_filename TEXT NOT NULL,
  replay_version    INTEGER NOT NULL,
  map_type          TEXT NOT NULL,         -- validated by Zod, not SQL
  uploader_slot     INTEGER CHECK (uploader_slot BETWEEN 0 AND 3), -- NULL until chosen
  status            TEXT NOT NULL DEFAULT 'awaiting_player'
                    CHECK (status IN ('awaiting_player', 'queued', 'processing', 'processed', 'failed')),
  error             TEXT,
  duration_ticks    INTEGER,               -- NULL until processed
  uploaded_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  processed_at      TEXT,
  CHECK (status = 'awaiting_player' OR uploader_slot IS NOT NULL)
) STRICT;
CREATE INDEX replays_uploader_uploaded ON replays(uploader_user_id, uploaded_at DESC);

-- BLOBs live in their own tables so queries on replays never read them.
CREATE TABLE replay_files (
  replay_id INTEGER PRIMARY KEY REFERENCES replays(id) ON DELETE CASCADE,
  data      BLOB NOT NULL                  -- original .rep bytes; size is length(data)
) STRICT;

CREATE TABLE replay_analyses (
  replay_id        INTEGER PRIMARY KEY REFERENCES replays(id) ON DELETE CASCADE,
  analyzer_version INTEGER NOT NULL,
  data             BLOB NOT NULL           -- gzipped analysis JSON
) STRICT;

-- A replay gets a new job row each time it is queued.
CREATE TABLE jobs (
  id         INTEGER PRIMARY KEY,
  replay_id  INTEGER NOT NULL REFERENCES replays(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'queued'
             CHECK (status IN ('queued', 'running', 'done', 'failed')),
  attempts   INTEGER NOT NULL DEFAULT 0,
  locked_at  TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE INDEX jobs_status_id ON jobs(status, id);
CREATE UNIQUE INDEX jobs_one_active_per_replay ON jobs(replay_id)
  WHERE status IN ('queued', 'running');

-- One row per player, inserted at upload from `analyzer header`.
CREATE TABLE match_players (
  replay_id            INTEGER NOT NULL REFERENCES replays(id) ON DELETE CASCADE,
  slot                 INTEGER NOT NULL CHECK (slot BETWEEN 0 AND 3),
  name                 TEXT NOT NULL,
  team                 INTEGER NOT NULL,
  color                TEXT NOT NULL CHECK (color IN ('blue', 'red', 'green', 'purple')),
  -- Filled in by the worker; NULL until the replay is processed.
  result               TEXT CHECK (result IN ('win', 'loss')),
  defeated_at_tick     INTEGER,            -- also NULL when still active at the end
  apm                  REAL,
  gold_mined_total     INTEGER,
  peak_army_population INTEGER,
  peak_army_value      INTEGER,
  units_built          INTEGER,
  units_lost           INTEGER,
  kills                INTEGER,
  buildings_built      INTEGER,
  upgrades_completed   INTEGER,
  supply_blocked_count INTEGER,
  supply_blocked_ticks INTEGER,
  PRIMARY KEY (replay_id, slot)
) STRICT;
