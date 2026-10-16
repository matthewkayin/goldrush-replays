#pragma once

#include "replay.h"
#include <cstdint>
#include <optional>

// Bumped whenever the analysis output changes, so stored analyses from an
// older analyzer can be recognized.
const uint32_t ANALYZER_VERSION = 1;

struct PlayerAnalysis {
  // The tick in which the player stopped being active, by defeat or
  // disconnect. Empty if they were still active when the replay ended.
  std::optional<uint32_t> defeated_at_tick;
};

struct Analysis {
  uint32_t duration_ticks;
  PlayerAnalysis players[MAX_PLAYERS];
};

// Simulates the whole match from its inputs and observes it.
Analysis analyze_replay(const Replay &replay);
