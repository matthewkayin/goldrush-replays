#pragma once

#include "replay.h"
#include <cstdint>
#include <optional>
#include <vector>

// Bumped whenever the analysis output changes, so stored analyses from an
// older analyzer can be recognized.
const uint32_t ANALYZER_VERSION = 1;

// Time series are sampled once per second of game time.
const uint32_t SAMPLE_INTERVAL_TICKS = 60;
const uint32_t TICKS_PER_MINUTE = 60 * 60;

// One value per sample. Sample i is the state at the end of second i; the last
// sample is taken at the end of the replay, even when that second is cut
// short.
struct PlayerSeries {
  std::vector<uint32_t> gold;
  std::vector<uint32_t> gold_mined;
  std::vector<uint32_t> population;
  std::vector<uint32_t> max_population;
  std::vector<uint32_t> army_population;
  std::vector<uint32_t> army_value;
  // Credited inputs in each minute of the replay. The last minute may be cut
  // short.
  std::vector<uint32_t> apm_per_minute;
};

struct PlayerSummary {
  // Credited inputs per minute the player was in the match, to 1 decimal.
  double apm;
  uint32_t gold_mined_total;
  // The highest sampled values.
  uint32_t peak_army_population;
  uint32_t peak_army_value;
  uint32_t units_built;
  uint32_t units_lost;
  // Units of players on other teams that this player's entities killed.
  uint32_t kills;
  // Buildings placed minus buildings cancelled. Landmines are not buildings.
  uint32_t buildings_built;
  uint32_t upgrades_completed;
  // Ticks in which at least one of the player's buildings was supply blocked,
  // and how many separate runs of such ticks there were.
  uint32_t supply_blocked_count;
  uint32_t supply_blocked_ticks;
};

struct PlayerAnalysis {
  // The tick in which the player stopped being active, by defeat or
  // disconnect. Empty if they were still active when the replay ended.
  std::optional<uint32_t> defeated_at_tick;
  PlayerSummary summary;
  // Indexed by EntityType; only unit types are counted.
  uint32_t units_built_by_type[ENTITY_TYPE_COUNT];
  uint32_t units_lost_by_type[ENTITY_TYPE_COUNT];
  PlayerSeries series;
};

enum BuildAction { BUILD_PURCHASED, BUILD_CANCELLED };

struct BuildOrderItem {
  uint32_t tick;
  uint8_t slot;
  EntityType entity_type;
  BuildAction action;
};

enum UpgradeAction { UPGRADE_PURCHASED, UPGRADE_CANCELLED, UPGRADE_COMPLETED };

struct UpgradeItem {
  uint32_t tick;
  uint8_t slot;
  // One UPGRADE_* bit.
  uint32_t upgrade;
  UpgradeAction action;
};

struct Kill {
  uint32_t tick;
  uint8_t attacker_slot;
  EntityType attacker_type;
  uint8_t defender_slot;
  EntityType defender_type;
};

struct Analysis {
  uint32_t duration_ticks;
  PlayerAnalysis players[MAX_PLAYERS];
  // Each list is in tick order.
  std::vector<BuildOrderItem> build_order;
  std::vector<UpgradeItem> upgrades;
  std::vector<Kill> kills;
};

// Simulates the whole match from its inputs and observes it.
Analysis analyze_replay(const Replay &replay);

// Snake_case ids used in the analysis output, e.g. "cowboy", "war_wagon".
const char *entity_type_name(EntityType type);
const char *upgrade_name(uint32_t upgrade);
const char *build_action_name(BuildAction action);
const char *upgrade_action_name(UpgradeAction action);
