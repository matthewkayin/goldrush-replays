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
};

struct PlayerAnalysis {
  // The tick in which the player stopped being active, by defeat or
  // disconnect. Empty if they were still active when the replay ended.
  std::optional<uint32_t> defeated_at_tick;
  PlayerSummary summary;
  PlayerSeries series;
};

struct Analysis {
  uint32_t duration_ticks;
  PlayerAnalysis players[MAX_PLAYERS];
};

// Simulates the whole match from its inputs and observes it.
Analysis analyze_replay(const Replay &replay);
