// Schemas for the JSON printed by the C++ analyzer (analyzer/src/main.cpp).
// `analyzer header` prints a ReplayHeader and `analyzer analyze` prints an
// Analysis. Every object is strict, so a field the analyzer adds or renames
// fails validation until it is added here too.
import { z } from "zod";

const tick = z.number().int().nonnegative();
const count = z.number().int().nonnegative();
const slot = z.number().int().min(0).max(3);

export const mapTypeSchema = z.enum(["tombstone", "boulder", "klondike"]);
export const playerColorSchema = z.enum(["blue", "red", "green", "purple"]);

export const unitTypeSchema = z.enum([
  "miner",
  "cowboy",
  "bandit",
  "wagon",
  "jockey",
  "sapper",
  "pyro",
  "soldier",
  "cannon",
  "detective",
  "balloon",
]);

export const entityTypeSchema = z.enum([
  "goldmine",
  "crate",
  "switch",
  ...unitTypeSchema.options,
  "hall",
  "house",
  "saloon",
  "bunker",
  "workshop",
  "smith",
  "coop",
  "barracks",
  "sheriffs",
  "landmine",
]);

export const upgradeSchema = z.enum([
  "war_wagon",
  "landmines",
  "bayonets",
  "private_eye",
  "getaway_boots",
  "iron_sights",
]);

const playerFields = {
  slot,
  name: z.string(),
  team: z.number().int().min(0).max(3),
  color: playerColorSchema,
};

export const replayHeaderSchema = z.strictObject({
  replay_version: z.number().int().nonnegative(),
  map_type: mapTypeSchema,
  players: z.array(z.strictObject(playerFields)),
});
export type ReplayHeader = z.infer<typeof replayHeaderSchema>;

export const playerSummarySchema = z.strictObject({
  apm: z.number().nonnegative(),
  gold_mined_total: count,
  peak_army_population: count,
  peak_army_value: count,
  units_built: count,
  units_lost: count,
  kills: count,
  buildings_built: count,
  upgrades_completed: count,
  supply_blocked_count: count,
  supply_blocked_ticks: count,
});
export type PlayerSummary = z.infer<typeof playerSummarySchema>;

// Sample i is the state at the end of second i of the match; the last sample
// is taken when the replay ends. apm_per_minute has one value per minute.
export const playerSeriesSchema = z.strictObject({
  gold: z.array(count),
  gold_mined: z.array(count),
  population: z.array(count),
  max_population: z.array(count),
  army_population: z.array(count),
  army_value: z.array(count),
  apm_per_minute: z.array(count),
});
export type PlayerSeries = z.infer<typeof playerSeriesSchema>;

// Unit types with a count of zero are left out.
const countsByUnitType = z.partialRecord(unitTypeSchema, count);

export const playerAnalysisSchema = z.strictObject({
  ...playerFields,
  defeated_at_tick: tick.nullable(),
  summary: playerSummarySchema,
  units_built_by_type: countsByUnitType,
  units_lost_by_type: countsByUnitType,
  series: playerSeriesSchema,
});
export type PlayerAnalysis = z.infer<typeof playerAnalysisSchema>;

export const buildOrderItemSchema = z.strictObject({
  tick,
  slot,
  entity: entityTypeSchema,
  action: z.enum(["purchased", "cancelled"]),
});
export type BuildOrderItem = z.infer<typeof buildOrderItemSchema>;

export const upgradeItemSchema = z.strictObject({
  tick,
  slot,
  upgrade: upgradeSchema,
  action: z.enum(["purchased", "cancelled", "completed"]),
});
export type UpgradeItem = z.infer<typeof upgradeItemSchema>;

export const killSchema = z.strictObject({
  tick,
  attacker_slot: slot,
  attacker: entityTypeSchema,
  defender_slot: slot,
  defender: entityTypeSchema,
});
export type Kill = z.infer<typeof killSchema>;

export const analysisSchema = z.strictObject({
  analyzer_version: z.literal(1),
  replay_version: z.number().int().nonnegative(),
  map_type: mapTypeSchema,
  duration_ticks: tick,
  sample_interval_ticks: z.literal(60),
  players: z.array(playerAnalysisSchema),
  build_order: z.array(buildOrderItemSchema),
  upgrades: z.array(upgradeItemSchema),
  kills: z.array(killSchema),
});
export type Analysis = z.infer<typeof analysisSchema>;
