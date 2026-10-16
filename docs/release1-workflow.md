# Release 1 build workflow (draft)

How the remaining Release 1 stories get built with a lead session plus a few parallel agents. `docs/project.md` stays the source of truth for *what* to build; this file only covers *who builds what, in what order*.

## Shape

```
Wave 0  lead, serial      foundation + auth story + all API contracts   → user reviews, commits
Wave 1  3 agents, parallel (one git worktree each)
          ingest    server: upload, choose player, worker, win/loss, list endpoint
          library   web:    upload page, player picker, "My replays" with polling
          match     both:   match + analysis + download endpoints, match page
Wave 2  lead, serial      merge, run everything against the 4 test replays  → user reviews, commits
```

Three agents, not one per story, because the remaining stories share code (the upload story feeds the list, the worker feeds the match page) and every change is reviewed by hand before it's committed. More agents would mean more merge conflicts and more to review at once, without saving time.

## Wave 0: lead session, serial

Everything parallel agents would otherwise each invent differently. Nothing in Wave 1 starts until this is committed, because worktrees are created from `HEAD`.

1. **Server skeleton** (done). `buildApp()` in `apps/server/src/app.ts`, route modules in `src/routes/`, the `{ message }` error shape, `buildTestApp(t)` for tests, and `API_PORT` and `DB_PATH` from env. `ANALYZER_PATH` is left for the upload story, which is the first thing to use it.
2. **Web skeleton** (done). React Router, TanStack Query, MUI theme, `apiGet`/`apiPost` in `src/api/client.ts`, and a layout with an empty slot in the header. `WEB_PORT` and `API_PORT` from env, so worktrees can run side by side.
3. **Auth story, end to end.** Also fills the header slot with nav and the signed-in/signed-out state. `db/users.ts`, `db/sessions.ts`, argon2id hashing, the session cookie, `POST /api/auth/register`, `/login`, `/logout`, `GET /api/auth/me`, a `requireUser` hook, sign-in and register pages, and tests. Auth is small, and every other story depends on it, so it's faster built once by one session than split across agents.
4. **API contracts for every remaining endpoint**, as Zod schemas in `packages/shared/src/api.ts`: upload response (per-file accepted/rejected), choose-player request, replay list item and page, match overview, analysis response, error shape. These are what let Wave 1 run in parallel: each agent builds against the contract, not against the others' code.
5. Update `docs/project.md` (Decisions: parallel build, file ownership) and `CLAUDE.md` (repo state).

## Wave 1: three parallel agents

Each agent runs in its own worktree on its own branch, owns a set of files, and treats everything else as read-only. Files outside its ownership change only if the brief says so; if the contract turns out to be wrong, the agent stops and reports rather than editing `packages/shared/src/api.ts` itself.

| Agent | Owns | Develops against |
|---|---|---|
| ingest | `routes/replays.ts`, `db/replays.ts`, `db/replay-files.ts`, `db/jobs.ts`, `db/match-players.ts` (writes), `worker.ts`, `win-loss.ts`, their tests | Real analyzer on the 4 test replays |
| library | `apps/web/src/pages/upload/`, `apps/web/src/pages/replays/` | Contract schemas; API mocked in tests, or the ingest branch once it lands |
| match | `routes/matches.ts`, `db/matches.ts` (read queries only), `apps/web/src/pages/match/` | Saved `analyzer/test_replays/*.analysis.json`, inserted directly in tests |

The match agent doesn't need the worker: the expected analysis files already pass `analysisSchema`, so the page and endpoints can be built on them while ingest builds the worker.

Each agent's brief contains:
- The story text and acceptance criteria, copied from `docs/project.md`.
- Its file ownership list, and the contracts it builds against.
- The absolute path to `old-project/` in the main checkout (`/home/kayin/vibe-replays/old-project`), since it's gitignored and missing from worktrees.
- The rules most likely to be broken: no ORM, no replay parsing in TypeScript, only `analyzer header` in a request, nothing written to disk but the db, Zod on every route.
- Done means: `pnpm typecheck` and `pnpm test` pass in the worktree, and a short report lists files changed, tests added, and any question or contract problem found. No commits; the lead and user review first.

## Wave 2: lead session, serial

1. Merge the three branches. Expected conflicts are small (route registration in `app.ts`, nav links in the layout).
2. Run `pnpm dev` and walk all four test replays through register → upload → choose player → list → match page → download.
3. Run an independent review (`/code-review`) of the merged diff.
4. Fix, update `docs/project.md` and `CLAUDE.md`, hand over for review and commit.

## Open questions

- **Which story owns the worker?** No story's acceptance criteria cover it directly. Upload stops at "queue an analysis job", while "See my replays" and "View a match page" need jobs to finish. This draft gives it to ingest alongside upload.
- **Story order.** `CLAUDE.md` says Release 1 stories are built in the order listed. Wave 1 builds upload, list, match page and download at the same time. That needs a Decisions entry and a `CLAUDE.md` change if we go ahead.
