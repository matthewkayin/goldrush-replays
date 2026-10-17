// Turns a replay and its analysis into what the match page shows: labels,
// timestamps, chart data, timelines and tables. Kept free of React so it can
// be tested without a DOM.
import {
  unitTypeSchema,
  type Analysis,
  type BuildOrderItem,
  type EntityType,
  type MatchPlayer,
  type PlayerAnalysis,
  type PlayerSeries,
  type UnitType,
  type Upgrade,
} from "@goldrush/shared";
import { playerColors, teamName, ticksPerSecond } from "../../display.ts";

const secondsPerMinute = 60;

// The game's display names (entity_data.cpp and upgrade.cpp).
export const entityNames: Record<EntityType, string> = {
  goldmine: "Gold Mine",
  crate: "Crate",
  switch: "TNT Switch",
  miner: "Miner",
  cowboy: "Cowboy",
  bandit: "Bandit",
  wagon: "Wagon",
  jockey: "Jockey",
  sapper: "Sapper",
  pyro: "Pyro",
  soldier: "Soldier",
  cannon: "Cannoneer",
  detective: "Detective",
  balloon: "Balloon",
  hall: "Town Hall",
  house: "House",
  saloon: "Saloon",
  bunker: "Bunker",
  workshop: "Workshop",
  smith: "Blacksmith",
  coop: "Chicken Coop",
  barracks: "Barracks",
  sheriffs: "Sheriff's Office",
  landmine: "Land Mine",
};

export const upgradeNames: Record<Upgrade, string> = {
  war_wagon: "Wagon Armor",
  landmines: "Land Mines",
  bayonets: "Bayonets",
  private_eye: "Private Eye",
  getaway_boots: "Getaway Boots",
  iron_sights: "Iron Sights",
};

export function isUnit(entity: EntityType): entity is UnitType {
  return (unitTypeSchema.options as readonly string[]).includes(entity);
}

// Who won, from the results the worker stored: one player ("stew won"), a
// whole team ("Team 1 won"), or a list of players. Null until the replay is
// processed.
export function describeWinner(players: MatchPlayer[]): string | null {
  if (players.some((player) => player.result === null)) {
    return null;
  }
  const winners = players.filter((player) => player.result === "win");
  const [first] = winners;
  if (!first) {
    return "No one won";
  }
  if (winners.length === 1) {
    return `${first.name} won`;
  }
  const team = players.filter((player) => player.team === first.team);
  const isWholeTeam =
    winners.every((player) => player.team === first.team) &&
    winners.length === team.length;
  if (isWholeTeam) {
    return `${teamName(first.team)} won (${winners.map((player) => player.name).join(", ")})`;
  }
  return `${winners.map((player) => player.name).join(", ")} won`;
}

// One line on a time-series chart.
export interface ChartLine {
  id: string;
  // The player the line belongs to.
  slot: number;
  label: string;
  color: string;
  data: number[];
}

// `times` are in seconds of match time, one per point of every line.
export interface TimeChart {
  times: number[];
  lines: ChartLine[];
}

// Where to put the time axis ticks, in seconds: whole minutes, spaced so
// there are at most `maxTicks` of them.
export function minuteTicks(lastSecond: number, maxTicks = 8): number[] {
  const lastMinute = Math.floor(lastSecond / secondsPerMinute);
  const step =
    [1, 2, 5, 10, 15, 20, 30].find(
      (minutes) => lastMinute / minutes < maxTicks,
    ) ?? 60;
  const ticks: number[] = [];
  for (let minute = 0; minute <= lastMinute; minute += step) {
    ticks.push(minute * secondsPerMinute);
  }
  return ticks;
}

// The match time of each sample, in seconds. Sample i is the state at the
// end of second i + 1, except the last, which is taken when the replay ends.
export function sampleTimes(analysis: Analysis): number[] {
  const sampleCount = analysis.players[0]?.series.gold.length ?? 0;
  return Array.from(
    { length: sampleCount },
    (_, index) =>
      Math.min(
        (index + 1) * analysis.sample_interval_ticks,
        analysis.duration_ticks,
      ) / ticksPerSecond,
  );
}

// Gold mined in the minute up to each sample, from the running total. The
// first minute counts from the start of the match.
export function incomePerMinute(goldMined: number[]): number[] {
  return goldMined.map(
    (total, index) => total - (goldMined[index - secondsPerMinute] ?? 0),
  );
}

// The chart with the hidden players' lines left out.
export function withoutPlayers(
  chart: TimeChart,
  hiddenSlots: ReadonlySet<number>,
): TimeChart {
  return {
    times: chart.times,
    lines: chart.lines.filter((line) => !hiddenSlots.has(line.slot)),
  };
}

function playerLine(player: PlayerAnalysis, data: number[]): ChartLine {
  return {
    id: `slot-${player.slot}`,
    slot: player.slot,
    label: player.name,
    color: playerColors[player.color],
    data,
  };
}

function sampledChart(
  analysis: Analysis,
  values: (series: PlayerSeries) => number[],
): TimeChart {
  return {
    times: sampleTimes(analysis),
    lines: analysis.players.map((player) =>
      playerLine(player, values(player.series)),
    ),
  };
}

// Each value is the player's actions in one minute, drawn at the end of that
// minute. The last minute may be cut short by the end of the replay.
function apmChart(analysis: Analysis): TimeChart {
  const minutes = analysis.players[0]?.series.apm_per_minute.length ?? 0;
  const durationSeconds = analysis.duration_ticks / ticksPerSecond;
  return {
    times: Array.from({ length: minutes }, (_, index) =>
      Math.min((index + 1) * secondsPerMinute, durationSeconds),
    ),
    lines: analysis.players.map((player) =>
      playerLine(player, player.series.apm_per_minute),
    ),
  };
}

export interface MatchChart {
  title: string;
  description: string;
  chart: TimeChart;
}

export function matchCharts(analysis: Analysis): MatchChart[] {
  return [
    {
      title: "Gold",
      description: "Gold in the bank",
      chart: sampledChart(analysis, (series) => series.gold),
    },
    {
      title: "Gold mined",
      description: "Total gold mined so far",
      chart: sampledChart(analysis, (series) => series.gold_mined),
    },
    {
      title: "Income",
      description: "Gold mined in the last minute",
      chart: sampledChart(analysis, (series) =>
        incomePerMinute(series.gold_mined),
      ),
    },
    {
      title: "Population",
      description: "Population used",
      chart: sampledChart(analysis, (series) => series.population),
    },
    {
      title: "Army population",
      description: "Population used by army units",
      chart: sampledChart(analysis, (series) => series.army_population),
    },
    {
      title: "Army value",
      description: "Gold cost of living army units",
      chart: sampledChart(analysis, (series) => series.army_value),
    },
    {
      title: "APM",
      description: "Actions in each minute",
      chart: apmChart(analysis),
    },
  ];
}

export function buildOrderFor(
  analysis: Analysis,
  slot: number,
): BuildOrderItem[] {
  return analysis.build_order.filter((item) => item.slot === slot);
}

// One research, from purchase to completion or cancellation.
export interface UpgradeTiming {
  upgrade: Upgrade;
  // Null only if the purchase wasn't recorded.
  purchasedAt: number | null;
  // When it completed or was cancelled, or null if still researching when
  // the replay ended.
  endedAt: number | null;
  outcome: "completed" | "cancelled" | "researching";
}

// Pairs each purchase of an upgrade with the completion or cancellation
// that follows it.
export function upgradeTimings(
  analysis: Analysis,
  slot: number,
): UpgradeTiming[] {
  const timings: UpgradeTiming[] = [];
  const researching = new Map<Upgrade, UpgradeTiming>();
  for (const item of analysis.upgrades) {
    if (item.slot !== slot) {
      continue;
    }
    if (item.action === "purchased") {
      const timing: UpgradeTiming = {
        upgrade: item.upgrade,
        purchasedAt: item.tick,
        endedAt: null,
        outcome: "researching",
      };
      timings.push(timing);
      researching.set(item.upgrade, timing);
      continue;
    }
    let timing = researching.get(item.upgrade);
    if (!timing) {
      timing = {
        upgrade: item.upgrade,
        purchasedAt: null,
        endedAt: null,
        outcome: "researching",
      };
      timings.push(timing);
    }
    timing.endedAt = item.tick;
    timing.outcome = item.action;
    researching.delete(item.upgrade);
  }
  return timings;
}

export interface UnitCount {
  unit: UnitType;
  built: number;
  lost: number;
}

// Unit types the player built or lost, in the game's order.
export function unitCounts(player: PlayerAnalysis): UnitCount[] {
  return unitTypeSchema.options
    .map((unit) => ({
      unit,
      built: player.units_built_by_type[unit] ?? 0,
      lost: player.units_lost_by_type[unit] ?? 0,
    }))
    .filter(({ built, lost }) => built > 0 || lost > 0);
}

export interface KillCount {
  units: number;
  buildings: number;
}

// Kills by attacking player and then defending player:
// `killCounts(analysis)[attacker][defender]`. Every pair of players in the
// match is present, including a player and themselves. Anything that isn't
// a unit (buildings, land mines) counts as a building.
export function killCounts(
  analysis: Analysis,
): Record<number, Record<number, KillCount>> {
  const counts: Record<number, Record<number, KillCount>> = {};
  for (const attacker of analysis.players) {
    counts[attacker.slot] = {};
    for (const defender of analysis.players) {
      counts[attacker.slot]![defender.slot] = { units: 0, buildings: 0 };
    }
  }
  for (const kill of analysis.kills) {
    const count = counts[kill.attacker_slot]?.[kill.defender_slot];
    if (!count) {
      continue;
    }
    if (isUnit(kill.defender)) {
      count.units++;
    } else {
      count.buildings++;
    }
  }
  return counts;
}
