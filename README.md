# Gold Rush Replays

Gold Rush Replays is a replay analytics site for my game [Gold Rush](https://github.com/matthewkayin/goldrush-public). The site allows users to upload replays of their game. From there they can see how metrics like gold, population, and APM changed throughout the course of the match. Users can also share their replays with friends, browse replays uploaded by other uses, and track the win/loss rates of themselves and other users.

<span>
    <image src="./readme/list.png" width="45%" />
    <image src="./readme/summary.png" width="45%" />
</span>
<span>
    <image src="./readme/graphs.png" width="45%" />
    <image src="./readme/user_profile.png" width="45%" />
</span>

## Commands

Requires Node 24+, pnpm, CMake 3.20+ and a C++20 compiler. Run from the repo root.

- `pnpm install` - install all workspace dependencies
- `pnpm dev` - run the site in development mode
- `pnpm build` - build the analyzer and the web app
- `pnpm compile-commands` - writes `analyzer/compile_commands.json` for clangd tooling
- `pnpm test` - run all tests
- `pnpm test:ts` - run typescript-only tests

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

For the most part, this is just a simple CRUD app, but the replays introduce an interesting complicating factor. 

The replay files from my game are a binary format that I designed. They contain only game inputs, which keeps their size small and makes it possible to write them during a gameplay without affecting game performance. But this means that working with them in a web app is not so simple. In order to understand a replay, you must re-simulate the entire game based on the inputs that the file contains. The game itself contains simulation code that can simulate the replay, but this code consists of 1000s of lines of C++ that I would rather not port into TypeScript.

Furthermore, simulating the replays takes time. Even using C++, simulating a full 40 minute game takes about 1 minute on my machine. This is an unacceptable amount of delay for a user of the site's API, so the site needs to be able to process replays independently from API calls.

The solution to these problems is to break the site up into 4 parts:

### 1. Analyzer (C++ CLI)

  The analyzer is a C++ CLI tool that processes replays and turns them into statistics for the site. The bulk of the analyzer code is a port of my game's simulation code. To gather analytics, I repurposed the game's event system so that events from the simulation bubble up to the analyzer that is running it. The result is that after each "tick" in the simulation, the analyzer can check for events and use them to record metrics.

  The analyzer has two running modes: `analyze` and `header`. The `header` mode is used by the API to quickly get information out of the replay file without waiting on a whole simulation. The `analyze` mode is used by the Worker to simulate the full replay and gather analytics.

### 2. API (TypeScript / Fastify API)

  The API is a Fastify API that handles requests from the frontend. It uses a SQLite database to store users and replays. The replay files themselves can be re-downloaded by users once they are uploaded. Replay files are stored directly in the `replay_files` table as a SQLite BLOB. Since the files are quite small, it is faster to store and retrieve them this way rather than use an external blob store.

  When the user uploads a replay, the API inserts a job into the `job` table, which queues the replay for processing.

### 3. Worker (TypeScript Job Runner)

  The Worker is a backend Node process that picks up jobs from the `job` table. For each job, it runs the Analyzer CLI in `analyze` mode, puts the returned analytics into the `replay_analyses` table, and updates the replay status to processed.

### 4. Frontend (TypeScript / React SPA)

  The frontend is a single-page web app. It allows users to create an account as well as browse and upload replays. Users can filter replays by name, uploader, and upload data. 

  Whenever users are viewing an unprocessed replay in the replay list, the frontend polls the API until the API reports that all replays have been processed. This allows users to see when their replay has finished processing without having to manually refresh the page.
