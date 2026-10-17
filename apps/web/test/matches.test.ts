// Checks the match page's API calls and polling rule, and the functions that
// turn a replay and its analysis into what the page shows, using the saved
// analyzer outputs as input.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  analysisSchema,
  type Analysis,
  type MatchPlayer,
  type Replay,
} from "@goldrush/shared";
import { ApiError } from "../src/api/client.ts";
import {
  fetchMatch,
  fetchMatchAnalysis,
  isWaitingForAnalysis,
  matchPollIntervalMs,
  matchRefetchInterval,
  replayDownloadPath,
} from "../src/api/matches.ts";
import {
  buildOrderFor,
  describeWinner,
  incomePerMinute,
  killCounts,
  matchCharts,
  minuteTicks,
  sampleTimes,
  unitCounts,
  upgradeTimings,
} from "../src/pages/match/match-data.ts";
import { formatTick } from "../src/display.ts";
import { stubFetch } from "./stub-fetch.ts";

function savedAnalysis(name: string): Analysis {
  return analysisSchema.parse(
    JSON.parse(
      readFileSync(
        new URL(
          `../../../analyzer/test_replays/${name}.analysis.json`,
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
}

const team = savedAnalysis("test_team");
const victoryLong = savedAnalysis("test_victory_long");

function player(fields: Partial<MatchPlayer> & { slot: number }): MatchPlayer {
  return {
    name: `Player ${fields.slot}`,
    team: fields.slot,
    color: "blue",
    result: null,
    defeatedAtTick: null,
    ...fields,
  };
}

const queuedReplay: Replay = {
  id: 7,
  filename: "test_team.rep",
  uploadedAt: "2026-10-17T10:00:00.000Z",
  processedAt: null,
  mapType: "tombstone",
  replayVersion: 0,
  durationTicks: null,
  status: "queued",
  error: null,
  uploaderSlot: 0,
  players: [player({ slot: 0, name: "stew" }), player({ slot: 1 })],
};

test("fetchMatch gets the overview by id", async (t) => {
  const requests = stubFetch(t, Response.json(queuedReplay));
  assert.deepEqual(await fetchMatch(7), queuedReplay);
  assert.equal(requests[0]!.method, "GET");
  assert.equal(new URL(requests[0]!.url).pathname, "/api/matches/7");
});

test("fetchMatchAnalysis gets and parses the analysis", async (t) => {
  const requests = stubFetch(t, Response.json(team));
  assert.deepEqual(await fetchMatchAnalysis(7), team);
  assert.equal(new URL(requests[0]!.url).pathname, "/api/matches/7/analysis");
});

test("fetchMatchAnalysis passes on 'Analysis not ready'", async (t) => {
  stubFetch(
    t,
    Response.json({ message: "Analysis not ready" }, { status: 404 }),
  );
  await assert.rejects(
    fetchMatchAnalysis(7),
    new ApiError(404, "Analysis not ready"),
  );
});

test("the download link points at the replay endpoint", () => {
  assert.equal(replayDownloadPath(7), "/api/matches/7/replay");
});

test("the overview polls only while the worker has the replay", () => {
  assert.equal(isWaitingForAnalysis("queued"), true);
  assert.equal(isWaitingForAnalysis("processing"), true);
  for (const status of ["awaiting_player", "processed", "failed"] as const) {
    assert.equal(isWaitingForAnalysis(status), false, status);
    assert.equal(matchRefetchInterval({ ...queuedReplay, status }), false);
  }
  assert.equal(matchRefetchInterval(queuedReplay), matchPollIntervalMs);
  assert.equal(matchRefetchInterval(undefined), false);
});

test("formatTick writes match time as m:ss at 60 ticks a second", () => {
  assert.equal(formatTick(0), "0:00");
  assert.equal(formatTick(59), "0:00");
  assert.equal(formatTick(60), "0:01");
  assert.equal(formatTick(60 * 75), "1:15");
  assert.equal(formatTick(victoryLong.duration_ticks), "41:10");
  assert.equal(formatTick(60 * 60 * 61 + 60 * 5), "61:05");
});

test("describeWinner names the winning player, team or players", () => {
  assert.equal(
    describeWinner([player({ slot: 0 }), player({ slot: 1 })]),
    null,
  );
  assert.equal(
    describeWinner([
      player({ slot: 0, name: "stew", result: "win" }),
      player({ slot: 1, name: "Bot", result: "loss" }),
    ]),
    "stew won",
  );
  assert.equal(
    describeWinner([
      player({ slot: 0, name: "stew", team: 0, result: "win" }),
      player({ slot: 1, name: "Bot", team: 0, result: "win" }),
      player({ slot: 2, team: 1, result: "loss" }),
      player({ slot: 3, team: 1, result: "loss" }),
    ]),
    "Team 1 won (stew, Bot)",
  );
  // The uploader left with two other teams still in: both win.
  assert.equal(
    describeWinner([
      player({ slot: 0, team: 0, result: "loss" }),
      player({ slot: 1, name: "Ann", team: 1, result: "win" }),
      player({ slot: 2, name: "Bea", team: 2, result: "win" }),
    ]),
    "Ann, Bea won",
  );
  assert.equal(
    describeWinner([player({ slot: 0, result: "loss" })]),
    "No one won",
  );
});

test("time axis ticks fall on whole minutes, at most 8 of them", () => {
  assert.deepEqual(minuteTicks(70), [0, 60]);
  assert.deepEqual(
    minuteTicks(7 * 60 + 30),
    [0, 60, 120, 180, 240, 300, 360, 420],
  );
  assert.deepEqual(
    minuteTicks(victoryLong.duration_ticks / 60),
    [0, 10, 20, 30, 40].map((minute) => minute * 60),
  );
});

test("samples are timed at the end of each second, and the last at the end of the replay", () => {
  const times = sampleTimes(team);
  assert.equal(times.length, team.players[0]!.series.gold.length);
  assert.deepEqual(times.slice(0, 3), [1, 2, 3]);
  assert.equal(times.at(-2), 1373);
  assert.equal(times.at(-1), team.duration_ticks / 60);
});

test("income per minute is the gold mined in the trailing 60 samples", () => {
  const mined = Array.from({ length: 125 }, (_, index) => index * 10);
  const income = incomePerMinute(mined);
  assert.equal(income.length, mined.length);
  assert.equal(income[0], 0);
  assert.equal(income[30], 300);
  assert.equal(income[59], 590);
  assert.equal(income[60], 600);
  assert.equal(income[124], 600);
});

test("every chart has a line per player in their color, as long as its times", () => {
  const charts = matchCharts(team);
  assert.deepEqual(
    charts.map((chart) => chart.title),
    [
      "Gold",
      "Gold mined",
      "Income",
      "Population",
      "Army population",
      "Army value",
      "APM",
    ],
  );
  for (const { title, chart } of charts) {
    for (const line of chart.lines) {
      assert.equal(line.data.length, chart.times.length, title);
    }
  }
  const gold = charts[0]!.chart;
  assert.deepEqual(
    gold.lines.map((line) => [line.id, line.label, line.color]),
    [
      ["slot-0", "stew", "#6cb348"],
      ["slot-1", "Bot", "#6092a6"],
      ["slot-2", "Bot", "#cc5e5c"],
      ["slot-3", "Bot", "#9a6aab"],
    ],
  );
  assert.equal(gold.lines[0]!.data, team.players[0]!.series.gold);

  const population = charts[3]!.chart;
  assert.equal(population.lines.length, 8);
  assert.deepEqual(population.lines[1], {
    id: "slot-0-max",
    label: "stew (max)",
    color: "#6cb348",
    data: team.players[0]!.series.max_population,
    dashed: true,
  });

  const apm = charts[6]!.chart;
  assert.equal(apm.times.length, 23);
  assert.deepEqual(apm.times.slice(0, 2), [60, 120]);
  assert.equal(apm.times.at(-1), team.duration_ticks / 60);
  assert.equal(apm.lines[0]!.data, team.players[0]!.series.apm_per_minute);
});

test("the income chart ends at the gold mined in the last minute", () => {
  const income = matchCharts(team).find((chart) => chart.title === "Income")!;
  const mined = team.players[0]!.series.gold_mined;
  assert.equal(
    income.chart.lines[0]!.data.at(-1),
    mined.at(-1)! - mined.at(-61)!,
  );
});

test("a player's build order is theirs alone, in order, with cancellations", () => {
  const buildOrder = buildOrderFor(team, 2);
  assert.ok(buildOrder.every((item) => item.slot === 2));
  assert.deepEqual(
    buildOrder.map((item) => item.tick),
    buildOrder.map((item) => item.tick).toSorted((a, b) => a - b),
  );
  assert.equal(
    buildOrder.length,
    team.build_order.filter((item) => item.slot === 2).length,
  );
  const allSlots = [0, 1, 2, 3].flatMap((slot) => buildOrderFor(team, slot));
  assert.ok(allSlots.some((item) => item.action === "cancelled"));
});

test("upgrade timings pair each purchase with its completion or cancellation", () => {
  assert.deepEqual(upgradeTimings(team, 0), [
    {
      upgrade: "iron_sights",
      purchasedAt: 25820,
      endedAt: 29419,
      outcome: "completed",
    },
  ]);

  const analysis: Analysis = {
    ...team,
    upgrades: [
      { tick: 100, slot: 1, upgrade: "bayonets", action: "purchased" },
      { tick: 150, slot: 0, upgrade: "bayonets", action: "purchased" },
      { tick: 200, slot: 1, upgrade: "bayonets", action: "cancelled" },
      { tick: 300, slot: 1, upgrade: "bayonets", action: "purchased" },
      { tick: 400, slot: 1, upgrade: "landmines", action: "purchased" },
      { tick: 900, slot: 1, upgrade: "bayonets", action: "completed" },
    ],
  };
  assert.deepEqual(upgradeTimings(analysis, 1), [
    {
      upgrade: "bayonets",
      purchasedAt: 100,
      endedAt: 200,
      outcome: "cancelled",
    },
    {
      upgrade: "bayonets",
      purchasedAt: 300,
      endedAt: 900,
      outcome: "completed",
    },
    {
      upgrade: "landmines",
      purchasedAt: 400,
      endedAt: null,
      outcome: "researching",
    },
  ]);
});

test("unit counts list each type made or lost, in the game's order", () => {
  assert.deepEqual(unitCounts(team.players[0]!), [
    { unit: "miner", built: 12, lost: 2 },
    { unit: "cowboy", built: 74, lost: 35 },
    { unit: "wagon", built: 0, lost: 1 },
    { unit: "soldier", built: 1, lost: 0 },
    { unit: "cannon", built: 13, lost: 3 },
  ]);
});

test("kill counts split each pair's kills into units and buildings", () => {
  const counts = killCounts(team);
  let total = 0;
  for (const attacker of [0, 1, 2, 3]) {
    for (const defender of [0, 1, 2, 3]) {
      const count = counts[attacker]![defender]!;
      total += count.units + count.buildings;
    }
  }
  assert.equal(total, team.kills.length);

  // A player's summary kills are units of other teams they killed.
  for (const attacker of team.players) {
    const enemyUnitKills = team.players
      .filter((defender) => defender.team !== attacker.team)
      .reduce(
        (sum, defender) => sum + counts[attacker.slot]![defender.slot]!.units,
        0,
      );
    assert.equal(enemyUnitKills, attacker.summary.kills, attacker.name);
  }
});
