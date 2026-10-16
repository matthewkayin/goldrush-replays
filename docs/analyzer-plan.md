# Plan: Analyzer CLI story (Release 1, story 1)

## Context
Release 1 starts with the analyzer: a standalone C++ CLI that turns a `.rep` into JSON. `analyzer header` validates a replay during upload, and `analyzer analyze` simulates the whole match in the worker. Today `analyzer/src/main.cpp` is a stub that exits 1. The game's simulation is in `old-project/backend/src/simulation/` (about 13k lines), and the old backend driver `simulation.cpp` shows how replays are read and stepped through.

The work is split into 6 phases. Each phase ends with a build, passing tests and a commit, so it can be checked before the next phase starts.

### Decisions already made (go into the PRD in the phase that implements them)
- **Win/loss** (decided with you): the analyzer reports each player's `defeated_at_tick` (null if they were still active at the end). The worker applies the win/loss rule using `uploader_slot`. That code gets built with the first story that writes `match_players`.
- **Fire deaths** (decided with you): units lost and kill/death trades come from `ENTITY_KILLED` only. Deaths from molotov fire or burning buildings emit no event, so they aren't counted. This is a known undercount.
- **Long-replay benchmark** (decided with you): the 40-minute `test_victory_long.rep` stands in for the hour-long match.
- **Not emitted by the game**: `RESEARCH_COMPLETE` and `PLAYER_DEFEATED` are never pushed. Upgrade completion is found by diffing `players[p].upgrades` bits after each tick. Defeat is found by diffing `players[p].mode`, which also covers `DISCONNECT` entries.
- **Event queue overflow**: `FixedQueue<MatchEvent, 32>` has no overflow check. The analyzer drains it after every input and every `match_update`, and raises `MATCH_MAX_EVENTS` to 1024. This is a marked change: the simulation never reads events.
- **Supply blocked time**: the number of ticks in which at least one of the player's buildings has `timer == BUILDING_QUEUE_BLOCKED`.

### Rules for the copied simulation
Every change is marked `// ANALYZER: <reason>`. `.claude/hooks/format.sh` skips `analyzer/src/simulation/*`, so the copy stays byte-close to the game's source. `diff -r old-project/backend/src/simulation analyzer/src/simulation` should show only marked lines (plus the removed `simulation.{h,cpp}`).

---

## Phase 1: The simulation compiles in the analyzer
- `cp -r` `old-project/backend/src/simulation/` into `analyzer/src/simulation/`, leaving out `simulation.{h,cpp}` (old backend driver: logger, database).
- Add the missing includes (marked). Done: only `<cstring>` was missing (`map_gen.cpp`, `fixed_queue.h`, `id_array.h`, `pool.h`). `<cstdint>` arrives everywhere through `defines.h`, and `<cstdarg>` was only used by the excluded driver's logger.
- `.claude/hooks/format.sh`: skip `analyzer/src/simulation/*`.
- `analyzer/CMakeLists.txt`: glob `src/simulation/**/*.cpp` into a static library `simulation` (`-Isrc`, warnings off for these sources only), and link `analyzer` against it. The Release build never uses `-ffast-math`.

**Verify:** `pnpm build:analyzer` builds with no warnings in our code. `pnpm test` passes (`no_command_fails`). The `diff -r` above shows only marked changes.

## Phase 2: Replay reader and `analyzer header`
- Vendor `analyzer/vendor/nlohmann/json.hpp` (v3.12.0, single header).
- `src/main.cpp`: arg parsing, reading the file argument or stdin into bytes, dispatch, and an exception handler that writes the message to stderr and exits 1.
- `src/replay.{h,cpp}`: `ReplayHeader` and `Replay{header, turns}`. This rewrites the reading half of `old-project/backend/src/simulation/simulation.cpp:45-147` with validation. It throws on:
  - truncation (`memread` already throws)
  - a bad signature, or a version other than `0`
  - `map_type ≥ MAP_TYPE_COUNT`
  - a player name with no null terminator, `recolor_id ≥ 4` or `team ≥ MAX_PLAYERS`
  - an entry before the first `NEW_TURN`, an unknown entry type, an input length over 1024, or `disconnect_player_id ≥ MAX_PLAYERS`

  Marked bounds checks in the simulation copy: `match_input_deserialize` (counts ≤ `SELECTION_LIMIT`; staying inside the buffer is handled by the reader instead, which deserializes from a zero-filled 1024-byte buffer and requires the bytes consumed to equal the entry's length) and `raw_map_memread` (`0 < width,height ≤ MAP_TILE_SIZE_MAX`).
- `header` reads the whole entry stream (parsing only, no simulation), so truncated uploads are rejected. A file cut exactly at an entry boundary can't be detected.
- Output: `{ replay_version, map_type: "tombstone"|"boulder"|"klondike", players: [{ slot, name, team, color: "blue"|"red"|"green"|"purple" }] }`. Inactive slots are left out.
- Test data:
  - `git mv test_replays/*.rep analyzer/test_replays/`. Done by the developer. The `old-project` replay is not used (developer's call), so there is no `test_1v1_bot.rep`.
  - Invalid fixtures made with `printf`/`head -c`: `bad_signature.rep`, `unknown_version.rep`, `truncated_header.rep`, `truncated_entries.rep`. Done: they are in `test_replays/invalid/` and `tests/make_invalid_fixtures.sh` makes them from `test_loss.rep`.
- `tests/run_and_compare.cmake` (`cmake -P`): runs the analyzer from a file or stdin (`execute_process(INPUT_FILE …)`) and runs `cmake -E compare_files` against the expected output. `tests/update_expected.sh` regenerates `*.header.json`.
- CTest:
  - `header` on each valid replay matches the expected JSON
  - one stdin variant
  - each invalid fixture exits non-zero with stderr set
- Docs: CLAUDE.md (new replay location, `update_expected.sh`), PRD Decision (`header` scans entries), the Test replays section.

**Verify:** `pnpm test`. Check by hand that the expected headers match what you know about each replay (team game has 2 teams, FFA has 4 players, names, colors).

## Phase 3: The simulation runs and reports defeat
- `src/analysis.{h,cpp}`: `match_init`, then `match_spawn_players`. Then for each tick in `[0, turns*4)`: apply the turn's entries at a turn boundary, call `match_update`, and drain events, which are thrown away in this phase. Raise `MATCH_MAX_EVENTS` to 1024 (marked). Diff `mode` to get `defeated_at_tick`.
- Output: `{ analyzer_version: 1, replay_version, map_type, duration_ticks, players: [{ slot, name, team, color, defeated_at_tick }] }`, plus `*.analysis.json` expected files and CTests.
- Time `analyze` on `test_victory_long.rep`, the baseline without metrics.
- Docs: the PRD Decisions for the win/loss split (analyzer vs. worker), defeat by diffing, and the event cap. Update the Result row in Metrics.

**Verify:** `pnpm test`. You confirm that the `defeated_at_tick` values fit how each match ended (`test_loss` vs. `test_victory_long`). Run all replays and fixtures once under an `-fsanitize=address,undefined` debug build.

**Phase 3 notes (2026-10-16):**
- Baseline `analyze` times (Release, no metrics): `test_loss` 1.5 s, `test_ffa` 12.9 s, `test_team` 19.3 s, `test_victory_long` 41.5 s. Raising the event cap made no difference. A rough gprof points at the game's own code (`unordered_map<EntityType, EntityData>::at`, `std::function` in `MatchFindBestEntityParams`, `entity_target_nearest_enemy`).
- Ticks run over `[0, turns*4)`. The old backend driver stopped one tick earlier (`turns*4 - 1`).
- UBSan: `util/lcg.cpp` overflows a signed `int` on every call. Building the simulation with `-fwrapv` gives identical output on all four replays. Open: whether to add it.
- UBSan: `map.cpp:515` (`map_get_cell`) reads cell y = 160 on 160×160 maps (`test_ffa`, `test_team`). It lands in the next cell layer inside `Map`, which the game does too, so it's left alone.
- An `-O0` sanitizer build is about 70× slower than Release (109 s for `test_loss`). Use `RelWithDebInfo` with the sanitizer flags instead.

## Phase 4: Time series and APM
- Every 60 ticks, per player: gold, gold_mined_total, population, max population, army population and army value. The army is `ENTITY_COWBOY`–`ENTITY_BALLOON` with `health != 0`.
- APM: before `match_handle_input`, resolve the input's first entity id against live state. By input type the id is `move/stop.entity_ids[0]`, `build.entity_ids[0]`, `build_cancel.building_id`, `building_enqueue/rally.building_ids[0]`, `building_dequeue.building_id`, `single_unload.entity_id`, `unload.carrier_ids[0]` or `camo/patrol.unit_ids[0]`. An unresolved input stays uncredited, and `NONE` inputs are skipped. Credited inputs are counted per minute.
- Output gains `sample_interval_ticks: 60`, and per player `series: { gold, gold_mined, population, max_population, army_population, army_value, apm_per_minute }` plus `summary: { apm, gold_mined_total, peak_army_population, peak_army_value }`. `apm` = credited inputs ÷ the minutes the player was in the match, rounded to 1 decimal.
- Regenerate the expected files. The diff should be additions only.

**Verify:** `pnpm test`, plus a by-hand look at the curves for one replay (gold rises, then falls when spending, and APM is plausible).

**Phase 4 notes (2026-10-16):**
- Sample *i* is taken after tick `(i+1)*60 - 1`, plus one after the last tick, so each series has `ceil(duration_ticks / 60)` values. `apm_per_minute` has `ceil(duration_ticks / 3600)` values. Peaks come from the samples.
- Every input in `test_loss` and `test_ffa` resolved to an owner (checked with a temporary counter, since removed).
- The time series cost nothing measurable: `test_loss` is still 1.5 s and `test_victory_long` 41.4 s.
- Expected analysis files grew to 150–480 KB each, because `dump(2)` puts every array value on its own line. The diff was additions only. The only changed lines were `defeated_at_tick` lines gaining a trailing comma.
- `ANALYZER_VERSION` stays 1: no analysis has been stored yet.
- `first_entity_id` ignores ids ≥ `ID_MAX`. The simulation itself indexes `id_to_index[id]` with input ids unchecked, so a crafted replay with such an id reads out of bounds there. The reader doesn't reject it yet.

## Phase 5: Events (build order, upgrades, kills, supply)
- An entity table `owner[ID_MAX]`/`type[ID_MAX]`, seeded after spawn and updated on `ENTITY_CREATED`. Spawn events are cleared, so starting units don't count as built.
- Events:
  - `ENTITY_PURCHASED`, `UNIT_CANCELLED` and `BUILDING_CANCELLED` (owner and type from the table) go to `build_order`.
  - `RESEARCH_PURCHASED`/`CANCELLED`, plus the `upgrades` bit diff for completed, go to `upgrades`.
  - `ENTITY_CREATED` counts toward built by type.
  - `ENTITY_KILLED` goes to `kills`, and counts toward lost by type and kills.
  - `SUPPLY_BLOCKED` increments the count, and a per-tick building scan counts the blocked ticks.
- Output adds the top-level `build_order[]`, `upgrades[]` and `kills[]`. Per player it adds `units_built_by_type`, `units_lost_by_type` and the rest of `summary` (`units_built`, `units_lost`, `kills`, `buildings_built` = created − cancelled, `upgrades_completed`, `supply_blocked_count`, `supply_blocked_ticks`). Names are snake_case ids defined in our code (`cowboy`, `wagon_armor`).
- Time `test_victory_long.rep` again, with all metrics.
- Docs: Metrics table updates (upgrade completion, the fire-death caveat, the supply-blocked definition), and the Decisions entries for these and for the 40-minute benchmark with its measured time. "Hour-long" is replaced throughout with the 40-minute `test_victory_long.rep`: the Analyzer section's first-milestone paragraph, the story acceptance criterion, the Test replays section, and the 2026-10-15 queue Decision note. Same for the CLAUDE.md test-replay list. If it runs well under a second, note that the queue can be revisited.

**Verify:** `pnpm test`. Check by hand that the build order for `test_loss.rep` matches what happened in that game, and that kill counts are plausible against units lost. Run the ASan/UBSan build once more.

## Phase 6: Shared schema and the first TS test
- `packages/shared/src/analyzer.ts`: `replayHeaderSchema` and `analysisSchema` (Zod, strict objects) and their inferred types, exported from `index.ts`.
- `packages/shared/test/analyzer-output.test.ts` (`node --test`): parses every `analyzer/test_replays/*.header.json` / `*.analysis.json` with the schemas.
- Root `package.json`: `test` → `pnpm test:analyzer && pnpm test:ts`, and `test:ts` → `pnpm -r test`. Update the CLAUDE.md Commands section.

**Verify:** `pnpm test` (CTest + node tests) and `pnpm typecheck`. Then make a deliberate field-name change in one expected file: the schema test must fail. Revert the change.

---

## End-of-story check against the acceptance criteria
- `header` prints version, map and players: phase 2
- `analyze` prints every metric and matches the schema: phases 4–6
- stdin input: phase 2
- truncated, bad signature and unknown version fail: phase 2
- matches the expected files: every phase
- the long replay's run time is recorded: phase 5
