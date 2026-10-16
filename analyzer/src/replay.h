#pragma once

#include "simulation/shared/match_setting.h"
#include "simulation/state/match.h"
#include <cstdint>
#include <memory>
#include <span>
#include <vector>

// A .rep file: a header followed by a stream of per-turn entries.
// The format is defined by the game; see "Background: how replays work" in
// docs/project.md.

const uint32_t REPLAY_SIGNATURE = 0x46591214;
const uint32_t REPLAY_VERSION = 0;
const uint32_t TICKS_PER_TURN = 4;

struct ReplayHeader {
  uint32_t version;
  int32_t lcg_seed;
  MapType map_type;
  std::unique_ptr<RawMap> raw_map;
  MatchPlayer players[MAX_PLAYERS];
};

enum ReplayEntryType : uint8_t {
  REPLAY_ENTRY_INPUT,
  REPLAY_ENTRY_CHAT,
  REPLAY_ENTRY_DISCONNECT,
  REPLAY_ENTRY_NEW_TURN
};

// Chat entries are skipped while reading, and turn boundaries become the
// indexes of Replay::turns, so only these two entry types are kept.
struct ReplayEntry {
  ReplayEntryType type; // REPLAY_ENTRY_INPUT or REPLAY_ENTRY_DISCONNECT
  MatchInput input;
  uint8_t disconnect_player_id;
};

struct Replay {
  ReplayHeader header;
  // turns[t] holds the entries applied at the start of turn t.
  std::vector<std::vector<ReplayEntry>> turns;
};

// Reads and validates a whole replay. Throws std::runtime_error if the replay
// is truncated, from an unknown version, or otherwise malformed.
Replay replay_read(std::span<uint8_t> bytes);

const char *map_type_name(MapType map_type);
const char *player_color_name(uint8_t recolor_id);
