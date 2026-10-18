# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview
This repo is for a site called Gold Rush Replays, a replay site for the real-time strategy game Gold Rush. This site should allow players of the game to upload a replay file and, within moments, see a match page that breaks down how they and their opponents played: economy, army, build order, upgrades, APM, and fights.

This is a side project. It is built to run on a developer laptop. Production hosting is not a goal.

## `docs/project.md` is the source of truth
`docs/project.md` is the PRD. It defines the architecture, repo layout, data model, metric definitions and the stories to build. Read the sections relevant to a task before starting it.

- **Build only what the PRD asks for.** Release 1 is built. Release 2 (global replay list, filtering, player profiles) is the current work, and its stories don't have to be built in the order listed. Nothing from "Later" or "Out of scope" gets built, even partially, unless the user asks. The data model already accounts for "Later".
- **Follow the Constraints section exactly.** The ones most easily broken by accident:
  - No ORM or query builder. Handwritten SQL with prepared statements through `better-sqlite3`.
  - Replay formats are never parsed in TypeScript. Anything that needs replay contents goes through the C++ analyzer.
  - Only `analyzer header` may run during an HTTP request. `analyzer analyze` only runs in the worker.
  - Nothing is written to disk except the SQLite database. Replays and analyses are BLOBs.
  - API inputs and outputs are validated with Zod schemas from `packages/shared`.
- **Don't guess on open questions.** If a story is ambiguous or the PRD contradicts itself or the code, ask the user. Don't pick an answer quietly.
- **Keep the PRD current.** When a decision is made with the user that changes or adds to the design, add a dated entry to "Decisions" and update the affected section. If code and PRD disagree, either fix the code or update the PRD. Don't leave them out of sync.

## Repo state and reference material
- The monorepo is scaffolded, and the first Release 1 story (Analyzer CLI) is built: `analyzer header` and `analyzer analyze` work, and their JSON output is described by Zod schemas in `packages/shared/src/analyzer.ts`. The database schema for all of Release 1 is in `apps/server/sql/001_init.sql`, applied by the migration runner in `apps/server/src/db/` whenever the API opens the database (`data/goldrush.db`). Add schema changes as a new numbered file; never edit an existing one. The server and web skeletons are in place, and every Release 1 story is built (accounts, upload and choose player, the job worker, "My replays", the match page and download). Of Release 2, "Browse all replays" and "Filter replays" are built: `/replays` is the public list of processed replays, with a "My replays" toggle (`?mine=true`) for the signed-in user's own replays at every status, and filters (uploader, filename, player, format, upload dates) kept in the URL by `pages/replays/page-param.ts` and applied in SQL by `findReplayIds`/`countReplays` in `apps/server/src/db/replays.ts`. Profile links wait for the Player profiles story. Where things are:
  - Server: `buildApp()` in `apps/server/src/app.ts` sets up Zod validation and the shared `{ message }` error shape, and registers route modules from `src/routes/` (`health.ts`, `auth.ts`, `replays.ts`, `matches.ts`). A route answers a 4xx by throwing `httpError(status, message)` from `src/routes/http-error.ts`. `src/api.ts` reads `src/config.ts`, opens the db and listens, and `buildApp()` takes the `analyzerPath` it runs `analyzer header` with (`src/analyzer.ts` runs the analyzer as a child process over stdin). Every request has `request.user` (the signed-in `User` or `null`), set from the session cookie in `src/auth/current-user.ts`; a route that needs a signed-in user adds `{ preHandler: requireUser }` from the same file, which answers 401 otherwise. Server tests build the app on an in-memory db with `buildTestApp(t)` (or `buildTestAppWithDb(t)` to also get the db) from `apps/server/test/helpers.ts` and call it with `app.inject()`; `registerUser(app)` there returns a user and its session token to send as `cookies: { session: token }`.
  - Replays: `findReplay`/`findReplays` in `apps/server/src/db/replays.ts` read a replay and its players as `replaySchema`. Every endpoint that returns a replay goes through them. The endpoint contracts are in `packages/shared/src/api.ts`.
  - Worker: `src/worker.ts` is the entrypoint and `src/job-runner.ts` the loop (claim, run `analyzer analyze`, store the gzipped analysis and the players' results and stats in one transaction). `src/win-loss.ts` applies the PRD's win/loss rule. Tests that upload or process replays use `test/replay-helpers.ts` (`postReplays`, `uploadTestReplay`, `queueTestReplay`) with the real analyzer, so build it first.
  - Web: React Router (`src/router.tsx`, every page a child of `components/Layout.tsx`), TanStack Query and an MUI theme (`src/theme.ts`). Components never call `fetch` directly. They go through `apiGet` and `apiPost` in `src/api/client.ts`, which parse responses with shared Zod schemas and throw `ApiError` on failure. `useCurrentUser()` in `src/api/auth.ts` gives the signed-in user (or `null`). Pages that need a signed-in user go under a `RequireUser` route (`components/RequireUser.tsx`) in `router.tsx`, which sends visitors to `/sign-in?next=…`. Pages live in `src/pages/{auth,upload,replays,match}/`, with their API hooks in `src/api/{auth,replays,matches}.ts`. How replay values are shown everywhere (match time, player colors, map names, teams) is in `src/display.ts`, and `components/PlayerName.tsx` draws a player with their color. Web tests can't render components (no DOM), so pages keep their logic in plain functions (e.g. `pages/match/match-data.ts`) and tests cover those; `test/stub-fetch.ts` fakes `fetch`.

  The layout in `docs/project.md` ("Repo layout") is the plan to follow when creating directories.
- `old-project/` is the previous version of this site. It is **gitignored**, so it exists only in the main checkout, not in fresh clones or git worktrees. It is reference only: read from it or copy from it, never import from it or edit it.
- `old-project/backend/src/simulation/` is the game's deterministic simulation. The analyzer's copy is `analyzer/src/simulation/` (without the old driver `simulation.{h,cpp}`), built as the `simulation` static library with warnings off. Replays only hold inputs, so the copied simulation must behave exactly like the game's. Don't change its logic, even to fix apparent bugs or "clean up". Only make changes needed to compile it or to observe it (hooks for metric collection), keep those small, and mark each one with `// ANALYZER: <reason>`. `diff -r old-project/backend/src/simulation analyzer/src/simulation` should show only marked lines. The format hook skips this directory so the copy stays byte-close to the original, and it must never be built with `-ffast-math`.
- `analyzer/test_replays/` holds the sample replays from the developer: `test_ffa.rep` (free-for-all), `test_team.rep` (team game), `test_loss.rep` (uploader loses), `test_victory_long.rep` (uploader wins, about 41 minutes). Use only these. Ignore `old-project/test_replays/`. Each replay has expected output files next to it (`<name>.header.json`, `<name>.analysis.json`). `analyzer/test_replays/invalid/` holds broken replays the analyzer must reject; `analyzer/tests/make_invalid_fixtures.sh` recreates them from `test_loss.rep`. If a story needs a replay that doesn't exist yet (e.g. uploader leaves early), ask the developer for it rather than building one by hand.

## Commands
Requires Node 24+, pnpm, CMake 3.20+ and a C++20 compiler. Run from the repo root.

- `pnpm install`: install all workspace dependencies.
- `pnpm dev`: build the analyzer, then start the API (port 3000), the job worker (both `node --watch`) and Vite (port 5173, proxies `/api` to the API). Env overrides: `API_PORT`, `WEB_PORT`, `DB_PATH`, `ANALYZER_PATH` and `WORKER_CONCURRENCY`, e.g. `API_PORT=3100 WEB_PORT=5273 pnpm dev` to run a git worktree next to the main checkout.
- `pnpm build`: build the analyzer and the web app.
- `pnpm build:analyzer`: configure and build the analyzer into `analyzer/build/`. The binary is `analyzer/build/analyzer`.
- `pnpm compile-commands`: configure the analyzer with CMake to write `analyzer/compile_commands.json` for clangd and other C++ tooling. clangd finds it there without extra setup.
- `pnpm typecheck`: typecheck every TypeScript package.
- `pnpm test`: run all tests (build the analyzer first): `pnpm test:analyzer` (the analyzer's CTest suite), then `pnpm test:ts` (each package's `test` script, using `node --test`). Today the TypeScript tests are in `packages/shared/test/`, `apps/server/test/` and `apps/web/test/`.
- Single analyzer test: `ctest --test-dir analyzer/build -R <test_name> --output-on-failure`.
- Single TypeScript test file: `node --test <file>` from the package's directory, e.g. `node --test test/analyzer-output.test.ts` in `packages/shared`.
- One package's script: `pnpm --filter @goldrush/server <script>` (packages are `@goldrush/server`, `@goldrush/web`, `@goldrush/shared`).
- Formatting: C++ under `analyzer/` uses clang-format's built-in LLVM style (`clang-format -i --style=LLVM <file>`). TS/JS/JSON/CSS/HTML use prettier with default settings (`pnpm exec prettier --write <file>`). A Claude Code PostToolUse hook (`.claude/hooks/format.sh`) runs these on every file Claude edits.

## Verifying work
- Before calling a task done, build what you changed and run its tests. Say plainly which tests ran and whether they passed.
- Analyzer tests compare output against saved expected JSON files. When output changes, check that the change is intended before regenerating the expected files, and say in your summary which files changed and why. Never regenerate them just to make a failing test pass. The expected files are also checked against the Zod schemas in `packages/shared/src/analyzer.ts` (`pnpm test:ts`), so any change to the analyzer's JSON shape needs the matching schema change. Regenerate them with `analyzer/tests/update_expected.sh` (needs a built analyzer), then review the git diff. On a mismatch, the test prints a `diff` command comparing the expected file with the actual output saved under `analyzer/build/test_output/`.

## Write Maintainable Code
As an agent, your job is to create good software. Good software is software that is maintainable. Notions of code quality like "cleanliness" or "elegance" are well-intentioned but aesthetic. They are not grounded in any reasoning.

Writing maintainable code means understanding that humans and agents will be editing this repo in the future. This means:
- Prefer simple solutions and code. That said, sometimes complexity is necessary. Prefer simple solutions, but use complexity as needed.
- Write code that reads like plain English and is self-documenting.
- Write tests whose primary purpose is not to verify behavior but to safeguard against regression (allowing code authors to make changes confidently knowing that the tests have their back).
- Write and maintain consistent documentation that allows humans and agents to understand the codebase. This includes keeping this file and `docs/project.md` up to date.
