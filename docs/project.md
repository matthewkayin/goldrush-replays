# PRD: Gold Rush Replays

## Outcome
A Gold Rush player can upload a replay file and, within moments, see a match page that breaks down how they and their opponents played: economy, army, build order, upgrades, APM and fights.

## Users
Players of Gold Rush, a real-time strategy game (C++/OpenGL, up to 4 players, teams and bots, Steam or LAN multiplayer). They want to review their own matches to improve, and share match links with friends.

This is a side project. It is built to run on a developer laptop. Production hosting is not a goal.

## Background: how replays work
A `.rep` file holds only inputs, not outcomes. It contains a header (signature `0x46591214`, replay version, LCG seed, map type, raw map, 4 × `MatchPlayer`) followed by a stream of per-turn entries (`INPUT`, `CHAT`, `DISCONNECT`, `NEW_TURN`). One turn is 4 ticks, and the game runs 60 ticks per second. The only way to get any metric is to run the deterministic match simulation from the start and observe it.

The game's simulation code, with graphics and sound removed, is in `old-project/backend/src/simulation/`. It is the starting point for the analyzer. The analyzer copies it into `analyzer/src/simulation/`, leaving out the old backend's driver (`simulation.{h,cpp}`). With GCC 16 that copy builds once `<cstring>` is included in the four files that call `memset`/`memcpy` without it. It simulated a 70-second 1v1 replay in about 70 ms.

Other facts that shape the design:
- Inputs carry no player id. Ownership has to come from the entities in the input (see APM below).
- `MatchPlayer` has no bot flag. Bots are named "Bot", but the site does not need to identify them.
- The replay version only changes when a change breaks compatibility. The developer bumps it by hand. Only version `0` exists today.
- A replay stops recording when the local player (the uploader) leaves the match.

## Architecture

```
React SPA (apps/web) ──HTTP──► API (apps/server, Fastify) ──► SQLite (data/goldrush.db)
                                   │                            users, sessions, replays, jobs,
                                   │                            match_players + summary stats,
                                   │  analyzer header (sync)    replay_files (BLOB), replay_analyses (BLOB)
                                   ▼                              ▲
                               analyzer (C++)                     │
                                   ▲                              │
Worker (apps/server, 2nd entrypoint) ── claims job ── analyzer analyze (async) ── writes results
```

### Repo layout
```
analyzer/           C++20 replay analyzer (simulation code copied from old-project, plus CLI + metrics)
apps/server/        TypeScript: Fastify API (src/api.ts) and job worker (src/worker.ts), sharing db code
apps/server/sql/    Numbered migration files (001_init.sql, 002_…)
apps/web/           Vite + React + TypeScript SPA
packages/shared/    Zod schemas and TS types shared by server and web (API contracts, analysis JSON shape)
tsconfig.base.json  Strict TypeScript options every package extends
data/               (gitignored) SQLite database file
old-project/        Reference only; nothing imports from it
docs/
```

### Analyzer (C++)
- A standalone command-line program with no database, networking or threads. It reads the replay bytes from stdin, or from a file path when one is given (for local testing). It prints JSON on stdout. On an invalid replay it exits non-zero and writes a message to stderr.
- `analyzer header [file]` validates the replay and prints the replay version, map type and players (slot, name, team, color). It parses the whole entry stream so truncated uploads are rejected, but it doesn't simulate, so it finishes in milliseconds. The API runs it **synchronously** during upload.
- `analyzer analyze [file]` simulates the whole match and prints the full analysis, including an `analyzer_version` field. It runs **asynchronously** in the worker through the job queue.
- Built with CMake. JSON output uses vendored nlohmann/json.
- Tested by running it on replays in `analyzer/test_replays/` and comparing against expected JSON files.

**Why both a synchronous step and a job queue:** the two commands do different amounts of work. Only the cheap header read happens during the request. Full simulation goes through the queue, because so far it has only been timed on a 70-second match. A long match has many times the ticks and many more entities per tick, with per-tick metric collection on top. The first analyzer milestone measured `analyze` on the 41-minute `test_victory_long.rep`: it takes about 42 s (see Decisions), so the queue stays.

### Server (TypeScript)
- Node 24 LTS, Fastify, Zod for request and response validation (through `fastify-type-provider-zod`), and pnpm workspaces.
- TypeScript runs directly through Node's built-in type stripping, so the server has no build step. This is why `erasableSyntaxOnly` is on (no enums, namespaces or parameter properties). `packages/shared` is consumed as TypeScript source by both the server and Vite, so it has no build step either.
- **No ORM.** The database is accessed through `better-sqlite3` with handwritten SQL in a small repository module per table (e.g. `db/replays.ts`). Every query uses prepared statements with bound parameters.
- `buildApp()` in `src/app.ts` builds the Fastify app without listening, so tests call it with `app.inject()`. Routes live in one plugin module per area in `src/routes/` (e.g. `routes/replays.ts`), each receiving the db as a plugin option. Every error response has the body `{ message }` (`apiErrorSchema` in `packages/shared`): 400 for validation errors, the thrown status for other 4xx errors, and a generic 500 that doesn't leak details. The web app calls the API only through `apiGet` and `apiPost` in `apps/web/src/api/client.ts`, which parse responses with the shared schemas and throw `ApiError` with that message.
- Migrations are plain numbered `.sql` files in `apps/server/sql/`. A small runner (`src/db/migrate.ts`) applies them in order, each in its own transaction, and records the last applied number in `PRAGMA user_version`. `openDb()` in `src/db/connection.ts` sets the pragmas and runs the migrations, and both the API and the worker open the database through it. A migration file is never edited once it exists; schema changes go in a new file.
- SQLite runs in WAL mode with `foreign_keys=ON` and a busy timeout, so the API and worker processes can share the one database file. Every transaction that writes is IMMEDIATE (takes the write lock before its first read), and each migration re-checks `user_version` under that lock, so the two processes can start together on a new database.
- **Binary data lives in SQLite.** Replay files and analysis results are stored as BLOB columns, each in its own table, so list queries never read them. Analysis JSON is gzipped before it is stored. The database is the only storage.
- Auth: username and password accounts that belong to the site and have nothing to do with Steam. Usernames are 3 to 20 characters from `A-Z a-z 0-9 _ -`. Passwords are 8 to 256 characters and are hashed with argon2id (the `argon2` package). Sessions live in an SQLite `sessions` table and are referenced by an httpOnly, SameSite=Lax cookie named `session` holding a random token. The table stores the token's SHA-256 hash, not the token. A session lasts 30 days from sign-in and isn't extended by use. Expired sessions are deleted whenever someone signs in.
  - Endpoints: `POST /api/auth/register` (201, signs the new user in; 409 if the username is taken), `POST /api/auth/login` (401 "Invalid username or password" for an unknown user or a wrong password alike), `POST /api/auth/logout` (deletes the session; fine when signed out) and `GET /api/auth/me` (`{ user }`, with `user: null` for visitors rather than a 401). Contracts are in `packages/shared/src/auth.ts`.
  - Every request gets `request.user` from the cookie. Routes that need a signed-in user use the `requireUser` preHandler, which answers 401 "Sign in required". In the web app, pages that need one go under the `RequireUser` route, which sends visitors to `/sign-in?next=<page>`.
- Endpoints (Release 1). Contracts, including status codes, are in `packages/shared/src/api.ts`. API JSON is camelCase, except the analysis, which is the analyzer's snake_case passed through. Every error is `{ message }`. A route marked "signed in" answers 401 for visitors, and a `/:id` route answers 404 for a replay that doesn't exist.
  - `POST /api/replays` (signed in, multipart, field `files` once per file, 5 MB per file): 200 with one result per file in upload order, `accepted` with the replay or `rejected` with a reason, even when every file is rejected. 400 when the request has no files.
  - `POST /api/replays/:id/player` (signed in) with `{ slot }`: 200 with the replay, now `queued`. 404 when the replay isn't the user's, 409 when it isn't `awaiting_player`, 400 when no player has that slot.
  - `GET /api/replays?page=N` (signed in): the user's replays, newest first, 20 per page, with `page`, `pageSize` and `total`.
  - `GET /api/matches/:id` (public): the replay at any status, so the match page can show a processing state and poll.
  - `GET /api/matches/:id/analysis` (public): the stored analysis, gunzipped. 404 "Analysis not ready" unless processed.
  - `GET /api/matches/:id/replay` (public): the original `.rep` bytes as `application/octet-stream`, with `Content-Disposition: attachment` using the original filename.
  - Every endpoint that returns a replay uses the same `replaySchema`: id, filename, uploadedAt, processedAt, mapType, replayVersion, durationTicks, status, error, uploaderSlot and players (slot, name, team, color, result, defeatedAtTick).
- Job queue: a `jobs` table in SQLite. The worker polls about once a second and claims a job atomically (`UPDATE … WHERE status='queued' … RETURNING`). It reads the replay BLOB and pipes it to `analyzer analyze` on stdin. The analyzer gets a 120 s timeout, and worker concurrency is configurable (default 2). A job gets 3 attempts and then the replay is marked `failed`. Jobs left `running` from a crashed worker are requeued when the worker starts, without counting that run as an attempt.
  - `src/worker.ts` is the entrypoint and `src/job-runner.ts` the loop. `ANALYZER_PATH` (default `analyzer/build/analyzer`, resolved from the source file rather than the cwd) and `WORKER_CONCURRENCY` come from the environment. The poll interval, timeout and attempts are constants in `src/config.ts`.
  - A claim increments `attempts` and sets the replay to `processing` in the same transaction. A failed attempt puts the job and the replay back to `queued`, until the last one, which sets both to `failed`. On success one transaction stores the analysis, fills in every `match_players` result and stat column, and marks the replay `processed` and the job `done`.
  - A failed replay's `error` is the analyzer's own message (e.g. "Replay file is truncated.") or a generic one when the server was at fault. `jobs.last_error` keeps the full error.

### Upload flow
1. `POST /api/replays` (multipart, one or more files): for each file, the API pipes the bytes to `analyzer header`. A valid file is stored as a `replays` row plus a `replay_files` BLOB with status `awaiting_player`, and the response includes its player list. An invalid file is rejected with a reason, and the other files are still accepted.
2. `POST /api/replays/:id/player` with `{ slot }`: the uploader says which player they were. The API saves `uploader_slot`, sets status `queued`, inserts a `jobs` row and responds right away with the updated replay.
3. The worker processes the job and sets status `processed`, or `failed` with an error.

### Data model (initial)
The whole schema is created by `apps/server/sql/001_init.sql`, including what the "Later" features need. All tables are `STRICT`. Timestamps are ISO-8601 TEXT in the format JS `toISOString()` writes (`YYYY-MM-DDTHH:MM:SS.sssZ`). IDs are `INTEGER PRIMARY KEY` rowids, except `sessions.id`. Every table that hangs off a replay is deleted with it (`ON DELETE CASCADE`), and replays and sessions are deleted with their user.
- `users`: id, username (unique, case-sensitive), password_hash (argon2id), created_at
- `sessions`: id (SHA-256 hex of the cookie token, so the raw token is only ever in the cookie), user_id, created_at, expires_at
- `replays`: id, uploader_user_id, original_filename, replay_version, map_type, uploader_slot (NULL until chosen), status (`awaiting_player` | `queued` | `processing` | `processed` | `failed`), error, duration_ticks (NULL until processed), uploaded_at, processed_at
  - Any status other than `awaiting_player` requires `uploader_slot`.
- `replay_files`: replay_id (PK, FK), data BLOB holding the original `.rep` bytes. The size is `length(data)`, which SQLite answers without reading the BLOB.
- `replay_analyses`: replay_id (PK, FK), analyzer_version, data BLOB holding the gzipped analysis JSON (full time series and event lists, which the match page loads whole)
- `jobs`: id, replay_id, status (`queued` | `running` | `done` | `failed`), attempts, locked_at, last_error, created_at
  - A replay gets a new job row each time it is queued, so reprocessing is another INSERT. At most one job per replay can be `queued` or `running`.
- `match_players`: replay_id, slot, name, team, color, result (`win` | `loss`), defeated_at_tick, and summary stats: apm, gold_mined_total, peak_army_population, peak_army_value, units_built, units_lost, kills, buildings_built, upgrades_completed, supply_blocked_count, supply_blocked_ticks
  - Rows are inserted at upload from `analyzer header` (slot, name, team, color), so every status can show the players. `result`, `defeated_at_tick` and the stats stay NULL until the worker fills them in. A NULL `defeated_at_tick` on a processed replay means the player was still active at the end.
  - Every player in a match gets a row, so the match page can show them all.
  - Profiles, trends and leaderboards only use rows where `slot = replays.uploader_slot`. Stats are never linked to another account by player name.
- `CHECK` constraints cover the values the server defines (statuses, `result`) and `color`. `map_type` is validated by the Zod analyzer schemas only, so a new map doesn't need a migration.

The full analysis goes in a BLOB because only one match page ever reads it. Summary stats go in SQL columns so the cross-match pages planned for later are plain queries.

### Frontend
- React 19, Vite, TypeScript, React Router, TanStack Query, MUI with MUI X Charts (the same choices as the old project), and react-dropzone for uploads.
- While a replay's status is `queued` or `processing`, the match page and the replay list poll for status every 2 seconds.
- The upload page rejects files that aren't `.rep` or are over `maxReplayFileBytes` before sending them. The server still checks the size, and the analyzer checks the contents.
- Teams are shown counting from 1 ("Team 1"), while replays and the API number them from 0. Entities and upgrades are shown with the game's display names, mapped from the analyzer's ids in `apps/web/src/pages/match/match-data.ts`, and players in the game's colors (`apps/web/src/display.ts`).

### Local development
- `pnpm install && pnpm dev` builds the analyzer (CMake) if it is missing, runs migrations, and starts the API, worker and Vite dev server together. Migrations run whenever the API or worker opens the database, and the server's `dev` script runs the API and the worker side by side (`dev:api`, `dev:worker`).
- No external services are needed. All state is in `data/goldrush.db`.

## Metrics (Release 1)
The analyzer computes these for every player in the match. Time series are sampled every second (60 ticks): sample *i* is the state at the end of second *i*, and the last sample is taken when the replay ends, even if that second is cut short.

**Army units** are Cowboy, Bandit, Wagon, Jockey, Sapper, Pyro, Soldier, Cannon, Detective and Balloon (`ENTITY_COWBOY` through `ENTITY_BALLOON`). Miners, gold mines and buildings are not army.

| Metric | Definition |
|---|---|
| Gold over time | `players[p].gold`, sampled |
| Gold mined | `gold_mined_total`, sampled; income per minute derived from it |
| Population | `match_get_player_population` and max population, sampled |
| Army population | Sum of `population_cost` over the player's living army units, sampled |
| Army value | Sum of `gold_cost` over the player's living army units, sampled |
| Peak army | The highest sampled army population and army value |
| APM | Non-`NONE` inputs per minute. Each input is credited to the owner of its first referenced entity or building, looked up *before* the input is applied. Inputs whose entities can't be resolved are left uncredited. Reported as a per-minute series (credited inputs in each minute of the replay; the last minute may be cut short) and a match average (credited inputs ÷ the minutes the player was in the match, up to `defeated_at_tick` or the end, rounded to 1 decimal). |
| Build order | Ordered list of `ENTITY_PURCHASED` events (units and buildings): tick, player, entity type, plus `UNIT_CANCELLED` and `BUILDING_CANCELLED`. Landmines are placed with energy and emit no purchase, so they aren't in it. |
| Upgrade timings | `RESEARCH_PURCHASED` and `RESEARCH_CANCELLED` events with ticks, plus completion, found when a bit appears in `players[p].upgrades` (the game never emits `RESEARCH_COMPLETE`) |
| Units made / lost | Counts of units (miners and army) by type, from `ENTITY_CREATED` (starting units excluded) and `ENTITY_KILLED`. Deaths from fire emit no event and aren't counted. |
| Buildings built | Buildings placed (`ENTITY_CREATED`) minus `BUILDING_CANCELLED`, excluding landmines and the starting hall |
| Kill/death trades | `ENTITY_KILLED` events between players' entities (units and buildings): tick, attacker owner and type, defender owner and type. A player's `kills` count is the units of players on other teams that their entities killed. |
| Supply blocked | Ticks in which at least one of the player's finished buildings has its queue blocked (`timer == BUILDING_QUEUE_BLOCKED`), and the number of separate blocked periods. A player at the 100 population cap isn't counted, since more houses wouldn't help. |
| Result | The analyzer reports each player's `defeated_at_tick`: the first tick in which their `players[p].mode` is `DEFEATED`, from losing all buildings or entities or from a `DISCONNECT` entry, or null if they were still active when the replay ended. The worker turns these into win/loss with the rule below. |

### Win/loss rule
Applied by the worker, using `defeated_at_tick` from the analyzer and the replay's `uploader_slot`. The analyzer doesn't know who uploaded the replay.
- A player who disconnects or leaves has lost. `DISCONNECT` entries are applied as defeat.
- The last team with at least one active player wins. Everyone else loses.
- If no player is active at the end, the winner can't be known, so every player gets a loss. The uploader either lost or left before the end, so a loss is right for them either way.
- A replay stops recording when the uploader leaves. So if it ends with more than one team still active, the uploader left while an opponent was still in the game: the uploader's team loses, and the other teams still active win.

## Constraints
- Replay parsing and simulation stay in C++ and reuse the game's simulation code. Replay formats are never re-implemented in TypeScript.
- The analyzer is a pure command-line program: replay bytes in, JSON out. The server never links to it, only runs it as a child process.
- Only `analyzer header` may run inside an HTTP request. Full simulation always goes through the job queue.
- No ORM or query builder. Use handwritten SQL with prepared statements through `better-sqlite3`, and plain `.sql` migration files.
- SQLite is the only storage, and replay files and analyses are stored as BLOBs. Nothing is written to the filesystem except the database file.
- Everything runs on one laptop with no external services.
- TypeScript in strict mode everywhere. API inputs and outputs are validated with Zod schemas from `packages/shared`.
- Upload size is capped at 5 MB per file.
- A replay and its stats belong only to the account that uploaded it.

## Release 1

### Story: Analyzer CLI
As a developer, I want a standalone analyzer that turns a replay into JSON, so that the server can run it and I can test it on its own.
Acceptance criteria:
- WHEN run as `analyzer header` on a valid replay THE SYSTEM SHALL print the replay version, map type and players as JSON and exit 0
- WHEN run as `analyzer analyze` THE SYSTEM SHALL print every Release 1 metric for every player, matching the shared analysis schema
- WHEN replay bytes are piped on stdin with no file argument THE SYSTEM SHALL read the replay from stdin
- WHEN the input is truncated, has a bad signature or has an unknown replay version THE SYSTEM SHALL exit non-zero with a message on stderr
- WHEN run on the replays in `analyzer/test_replays/` THE SYSTEM SHALL produce output that matches the saved expected JSON files
- WHEN run on the 41-minute `test_victory_long.rep` THE SYSTEM SHALL complete, and its run time SHALL be recorded in the Decisions log

### Story: Create an account and sign in
As a player, I want an account on the site, so that my uploaded replays are tied to me.
Acceptance criteria:
- WHEN a visitor submits a unique username and a password of at least 8 characters THE SYSTEM SHALL create the account and sign them in
- WHEN a visitor submits a username that is already taken THE SYSTEM SHALL reject it with a clear error
- WHEN a user signs in with valid credentials THE SYSTEM SHALL set a session cookie that keeps them signed in across reloads
- WHEN a user signs out THE SYSTEM SHALL invalidate the session on the server

### Story: Upload a replay and say which player I was
As a signed-in player, I want to upload one or more `.rep` files and mark which player was me, so that the site can analyze them and attribute the right stats to me.
Acceptance criteria:
- WHEN a signed-in user drops or selects `.rep` files THE SYSTEM SHALL upload them, validate each with `analyzer header`, store the valid ones, and show each one's player list
- WHEN a file is not a valid replay, has an unsupported replay version or is over 5 MB THE SYSTEM SHALL reject that file with a reason and still accept the other files
- WHEN the user picks a player slot for a replay THE SYSTEM SHALL save it as `uploader_slot` and queue an analysis job
- WHEN the job is queued THE SYSTEM SHALL respond right away, without waiting for the simulation
- WHEN a visitor who is not signed in tries to upload THE SYSTEM SHALL ask them to sign in

This story also builds the job worker (`src/worker.ts`) and the win/loss rule. No story's acceptance criteria cover them, but the list and the match page need jobs to finish, and this is the story that queues them.

### Story: See my replays and their status
As a signed-in player, I want a list of my uploaded replays, so that I can find matches and see whether they have finished processing.
Acceptance criteria:
- WHEN a user opens "My replays" THE SYSTEM SHALL list their replays, newest first, with date, players, map, duration, their result and status, paginated
- WHEN a replay is awaiting a player choice THE SYSTEM SHALL prompt the user to choose their player
- WHEN a replay is queued or processing THE SYSTEM SHALL show that status and update it without a manual reload
- WHEN analysis fails THE SYSTEM SHALL show the replay as failed with the error message

### Story: View a match page
As a player, I want a page for a single match with charts and timelines, so that I can understand how the match played out.
Acceptance criteria:
- WHEN anyone (signed in or not) opens a processed match's URL THE SYSTEM SHALL show the match overview: players, teams, colors, map type, duration, the winner, and which player the uploader was
- THE SYSTEM SHALL show per-player time-series charts of gold, gold mined/income, population, army population, army value and APM
- THE SYSTEM SHALL show each player's build order and upgrade timings as timelines with match timestamps
- THE SYSTEM SHALL show units made and lost by type, kill/death trades between players, and time spent supply blocked
- WHEN the match is still processing THE SYSTEM SHALL show a processing state and load the analysis when it is ready

### Story: Download a replay
As a player, I want to download the original replay file from a match page, so that I can watch it in the game or share it.
Acceptance criteria:
- WHEN anyone clicks "Download" on a match page THE SYSTEM SHALL return the original `.rep` bytes from the database, using the original filename

## Test replays
`analyzer/test_replays/` holds the developer's sample replays. Each has its expected analyzer output saved next to it.
- `test_ffa.rep`: 4-player free-for-all on Klondike, about 18 minutes.
- `test_team.rep`: 2v2 on Tombstone, about 23 minutes. Has `DISCONNECT` entries for slots 2 and 3 near the end.
- `test_loss.rep`: 1v1 against a bot on Tombstone that the uploader loses, about 14 minutes.
- `test_victory_long.rep`: 1v1 against a bot on Tombstone that the uploader wins, about 41 minutes. Has a `DISCONNECT` entry for slot 1 near the end.

`analyzer/test_replays/invalid/` holds broken copies of `test_loss.rep` (bad signature, unknown version, truncated header, truncated entries) that the analyzer must reject. `analyzer/tests/make_invalid_fixtures.sh` recreates them.

The developer will provide more replays on request. Ask for them when a story needs one, for example:
- a match where the uploader leaves early

## Later
These are agreed but not part of Release 1. Build nothing for them yet, but the data model above is designed with them in mind.
- **Player profiles:** a page per user listing their matches and their aggregate stats, as the uploader's player only.
- **Cross-match trends:** a user's APM, income, win rate and similar stats over time and by map type.
- **Leaderboards:** win rate, with a minimum number of games to qualify.
- **Map heatmap:** unit positions and fights over the map. This needs position sampling in the analyzer.
- **Reprocessing:** re-queue replays whose `replay_analyses.analyzer_version` is older than the current one.
- **Managing replays:** delete a replay, or change which player was the uploader.

## Out of scope
- Steam sign-in, or any link to Steam identities
- Uploading automatically from the game client
- Chat messages from replays
- Detecting bots, or excluding them from stats
- Matching a replay's player names to other accounts, linking accounts, or detecting duplicate uploads of the same match
- Private or unlisted matches (all match pages are public)
- Support for replay versions other than those the analyzer explicitly knows about (currently `0`)
- Playing replays back in the browser (for example by compiling the simulation to WebAssembly)
- Production deployment, scaling, other databases, or object storage

## Decisions
- 2026-10-15: Replay analysis stays in C++ and reuses the game's simulation code, because a replay holds only inputs and has to be simulated deterministically with the game's own logic.
- 2026-10-15: The analyzer is a standalone command-line program run as a child process, not an HTTP service, so it can be tested alone, a crash can't take down the API, and it needs no web framework.
- 2026-10-15: The API and worker are written in TypeScript (Fastify) instead of Crow, because accounts, uploads and validation are much easier there and the frontend can share its types.
- 2026-10-15: SQLite is the only datastore, so the project runs on a laptop with no services.
- 2026-10-15: Replay files and analysis results are stored as SQLite BLOBs rather than as files, because they are small and BLOB reads at this size are faster than separate file I/O. They live in their own tables so metadata queries don't read them.
- 2026-10-15: No ORM. Handwritten SQL through `better-sqlite3` and plain `.sql` migrations, for simplicity and performance.
- 2026-10-15: The header is read synchronously during upload, and the full simulation runs through a job queue in SQLite, because long matches had not been timed yet. (2026-10-16: the 41-minute replay takes about 42 s, so the queue stays.)
- 2026-10-15: Summary stats go in SQL columns and the full time series goes in a gzipped JSON BLOB per match, because only the match page reads the full series and cross-match pages need queryable summaries.
- 2026-10-15: Army units are Cowboy, Bandit, Wagon, Jockey, Sapper, Pyro, Soldier, Cannon, Detective and Balloon. Army is tracked both as population used and as gold value.
- 2026-10-15: Site accounts are independent of Steam, because replays can come from LAN games.
- 2026-10-15: The uploader marks which player they were. Stats count only toward the uploader, and only for that player. Player names are never matched across accounts, because a LAN player could use any name.
- 2026-10-15: A player who leaves loses, and the last team standing wins. A replay stops when the uploader leaves, so a replay that ends with an opposing team still active is a loss for the uploader.
- 2026-10-15: Leaderboards rank by win rate with a minimum number of games.
- 2026-10-15: All matches are public for now.
- 2026-10-15: Release 1 is the single-match page. Profiles, trends and leaderboards come later but are planned for in the data model.
- 2026-10-16: Server TypeScript runs through Node 24's native type stripping instead of a build step or `tsx`, and `packages/shared` is consumed as TypeScript source. This keeps the toolchain small. It requires erasable-only TypeScript syntax.
- 2026-10-16: `analyzer header` parses the whole entry stream, not just the header, so truncated or malformed uploads are rejected at upload time instead of failing later in the worker. It still doesn't simulate. A file cut exactly between two entries can't be detected.
- 2026-10-16: Besides the bad signature, unknown version and truncation cases, the reader rejects a map type or map size out of range, a player with a mode other than inactive/active, an unterminated name, a color ≥ 4 or a team ≥ 4, an entry before the first turn, an unknown entry or input type, an input whose length is 0, over 1024 or different from its contents, a selection over 20 entities, a disconnect of a player id ≥ 4, and a replay with no turns.
- 2026-10-16: The analyzer reports each player's `defeated_at_tick`, and the worker applies the win/loss rule using `uploader_slot`. The rule needs the uploader, which the analyzer never sees, so keeping it in the worker keeps the analyzer's output independent of who uploaded.
- 2026-10-16: Defeat is found by checking `players[p].mode` after every tick, because the simulation never emits `PLAYER_DEFEATED`. `DISCONNECT` entries set `mode` to `DEFEATED` when their turn is applied, as the old backend did, so they're caught the same way.
- 2026-10-16: Time series are sampled at the end of each second, plus a final sample when the replay ends. Peak army population and value are the highest sampled values, so they match the charts. The APM per-minute series holds raw counts per minute of the replay, and the APM average divides by the time the player was in the match, so a player who leaves early isn't penalized for the minutes after.
- 2026-10-16: The simulation's event queue (`MATCH_MAX_EVENTS`) is raised from 32 to 1024 in the analyzer's copy, and the analyzer drains it after every input and every tick. The queue has no overflow check, so overflowing it would silently lose events. The analyzer fails the analysis if it ever finds more events than the capacity. Nothing in the simulation reads the queue, so the change doesn't affect the simulation, and it made no measurable difference to run time.
- 2026-10-16: Measured on the 41-minute `test_victory_long.rep` (instead of an hour-long replay): `analyze` takes about 42 s with every Release 1 metric, against 41.5 s with no metrics, so the metrics cost almost nothing and the simulation itself is the cost. The job queue stays. An hour-long match should take about a minute, inside the worker's 120 s timeout.
- 2026-10-16: Upgrade completion is found by diffing `players[p].upgrades` after every tick, because the game never emits `RESEARCH_COMPLETE`.
- 2026-10-16: Units lost and kills come only from `ENTITY_KILLED`. Deaths from molotov fire or burning buildings emit no event, so they aren't counted. This is a known undercount.
- 2026-10-16: Supply blocked is measured by checking every building after every tick, not from `SUPPLY_BLOCKED` events, because the game only emits that event when a queue changes, not when a building becomes blocked during an update (e.g. a house dies). The count is the number of separate blocked periods. Being at the 100 population cap with units queued doesn't count as supply blocked (developer's call), even though the game blocks the queue the same way.
- 2026-10-16: A player's `kills` and `units_lost` count units only, so they can be compared. Kills of allies don't count. The `kills` event list also has buildings. Landmines aren't buildings for `buildings_built`.
- 2026-10-16: Output names for entity types and upgrades are snake_case ids defined in the analyzer (`cowboy`, `war_wagon`), not the game's display names.

- 2026-10-16: The analyzer's JSON output is described by strict Zod schemas in `packages/shared` (`replayHeaderSchema`, `analysisSchema`). A `node --test` test parses every saved expected file with them, so the C++ output and the TypeScript types can't drift apart unnoticed. `analysisSchema` accepts only `analyzer_version` 1; bumping the version means updating the schema too.
- 2026-10-16: The whole Release 1 schema (and what "Later" needs) is created up front by `001_init.sql`, so stories built in parallel share fixed tables instead of each adding migrations.
- 2026-10-16: `match_players` rows are inserted at upload from `analyzer header`, with result and stats NULL until processed, so player names are available at every status from one place.
- 2026-10-16: IDs are integer rowids. Match URLs can be enumerated, which is fine while all matches are public.
- 2026-10-16: `sessions.id` is the SHA-256 of the cookie token, so a copy of the database can't be used to hijack sessions.
- 2026-10-16: Timestamps are ISO-8601 TEXT in the `toISOString()` format, so they are readable in the sqlite3 shell and still sort as strings.
- 2026-10-16: Usernames are unique case-sensitively.
- 2026-10-16: A replay gets a new `jobs` row each time it is queued (statuses `queued`, `running`, `done`, `failed`), with a partial unique index allowing only one active job per replay. Reprocessing later is just another INSERT, and old rows keep their errors.
- 2026-10-16: `match_players` stores `supply_blocked_count` too, so it holds every field of the analyzer's per-player summary.
- 2026-10-16: `replay_files` stays a separate table rather than a column on `replays`. Replays are 40–80 KB, and SQLite keeps up to a page of a large BLOB in the row itself, so a BLOB column would make every `replays` row about a page and slow list and aggregate queries. `size_bytes` is dropped because `length(data)` gives it.
- 2026-10-16: Every API error has the body `{ message }`, so the web client can show any error the same way. Unexpected errors return a generic 500 message and are logged on the server.
- 2026-10-16: The API port, web port and database path can be set with `API_PORT`, `WEB_PORT` and `DB_PATH`, so a git worktree can run next to the main checkout without port or database clashes. The Vite proxy targets `127.0.0.1` because the API binds only that address.
- 2026-10-16: Usernames are 3 to 20 characters from `A-Z a-z 0-9 _ -`, so they're readable and URL-safe for profile pages later. Passwords have a 256-character maximum to bound hashing cost. Sign-in only checks that fields are non-empty, so a failed sign-in never reveals the rules.
- 2026-10-16: Sessions last 30 days from sign-in, with no sliding expiry, because it's the simplest rule and needs no write per request.
- 2026-10-16: Passwords are hashed with the `argon2` npm package (argon2id, its default parameters) rather than Node's built-in `crypto.argon2`, which is experimental in Node 24 and returns raw bytes, so the encoded hash format and verification would have to be written by hand.
- 2026-10-16: Sign-in answers the same 401 message for an unknown username and a wrong password, and checks a dummy hash for an unknown username, so neither the message nor the timing tells which usernames exist.
- 2026-10-16: `GET /api/auth/me` answers 200 with `user: null` for visitors instead of 401, because checking who is signed in is routine for every page and not an error. `POST /api/auth/logout` answers `{ user: null }` so the web client, which always parses a JSON body, needs no special case.
- 2026-10-16: The web app has one `RequireUser` route guard that sends visitors to the sign-in page and back afterwards, so the upload and "My replays" pages share it. `?next=` only accepts same-site paths.
- 2026-10-16: API JSON is camelCase. The analysis endpoint passes the analyzer's snake_case JSON through unchanged, so it isn't converted twice.
- 2026-10-16: One `replaySchema` serves list items, the match overview, the choose-player response and accepted uploads, so the web app has one replay type.
- 2026-10-16: Upload answers 200 with a result per file even when every file is rejected, because a multi-file upload is judged file by file.
- 2026-10-16: Match endpoints are public and keyed by replay id. The overview answers at every status, and the analysis answers 404 until the replay is processed.
- 2026-10-16: The replay list uses page numbers, 20 per page.
- 2026-10-17: Release 1 stories no longer have to be built in the order listed. After auth, the remaining stories are built in parallel by three agents (ingest, library, match), each in its own git worktree and building against the contracts in `packages/shared/src/api.ts`. `docs/release1-workflow.md` sets out who owns which files.
- 2026-10-17: The upload story owns the job worker and the win/loss rule, because it is the story that queues jobs.
- 2026-10-17: Code more than one parallel agent needs is written before they start, so they don't each write their own copy or conflict on the same files: the replay reader (`findReplay`/`findReplays` in `apps/server/src/db/replays.ts`, which maps a replay and its players to `replaySchema`), the new dependencies (`@fastify/multipart`, `react-dropzone`, `@mui/x-charts`), and the routes and header links for the upload, "My replays" and match pages, with placeholder pages.
- 2026-10-17: Uploads use `@fastify/multipart` with `throwFileSizeLimit: false`, so a file over 5 MB is rejected on its own while the rest of the request goes on. Files are validated one at a time, in upload order. Files under any field other than `files` are ignored.
- 2026-10-17: A job run cut short by the worker stopping or crashing doesn't count as an attempt (developer's call). The startup requeue decrements `attempts` and moves the replay from `processing` back to `queued`. The analyzer is a separate process, so a bad replay can't crash the worker, and `node --watch` restarts shouldn't use up attempts.
- 2026-10-17: A failed replay's `error` shows the analyzer's own message. Server-side failures show a generic message, and the details stay in `jobs.last_error` and the worker log.
- 2026-10-17: If no player is active when a replay ends, every player gets a loss (developer's call). A replay either ends in a clear result or ends because the uploader left, so the uploader has at least lost. Cases where the final winner can't be known, such as a 2v2 the uploader left while their teammate was still playing, count as a loss for the uploader.
- 2026-10-17: The upload page rejects files that aren't `.rep` or are over 5 MB before uploading them (developer's call to keep the extension check), so a multi-file drop isn't slowed by files the server would reject anyway.
- 2026-10-17: The match page's income chart is the gold mined in the 60 seconds before each sample, from the `gold_mined` running total (counted from the start during the first minute). The APM chart plots each minute's raw count at the end of that minute.
- 2026-10-17: The replay download sends `Content-Disposition: attachment` with an ASCII `filename` fallback (anything outside printable ASCII, plus quotes, backslashes and `%`, becomes `_`) and the exact name in `filename*=UTF-8''…` (RFC 6266/5987).
- 2026-10-17: A replay marked processed with no stored analysis answers 404 "Analysis not ready", the same as an unprocessed one. The worker writes both in one transaction, so it shouldn't happen.
- 2026-10-17: Kill counts on the match page count anything that isn't a unit, landmines included, as a building.
- 2026-10-17: Display helpers used by more than one page (`src/display.ts`, `components/PlayerName.tsx`) and the server's `httpError` (`src/routes/http-error.ts`) each live in one module, after the parallel agents wrote their own copies. `packages/shared` exports types for its enums (`MapType`, `PlayerColor`, `UnitType`, `EntityType`, `Upgrade`).
- 2026-10-17: Write transactions are IMMEDIATE. With two processes in WAL mode, a deferred transaction that reads and then writes fails with SQLITE_BUSY_SNAPSHOT, without waiting, if the other process committed in between. The worker gzips an analysis before taking the lock. Migrations re-check `user_version` under the lock, and `openDb` retries the switch to WAL, because `pnpm dev` starts the API and the worker on a new database at the same moment.
- 2026-10-17: The analyzer runs in its own process group, so Ctrl-C in `pnpm dev` reaches only the worker, which then kills it as an interrupted run. If the analyzer got the signal first, its death would count as a failed attempt.
- 2026-10-17: `?page=` is capped at 1,000,000 so the SQL OFFSET stays a valid integer, and `WORKER_CONCURRENCY` must be a whole number of at least 1 or the worker refuses to start.

## Open questions
None at this time.
