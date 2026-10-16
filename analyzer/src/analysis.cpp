#include "analysis.h"

#include <algorithm>
#include <format>
#include <iterator>
#include <memory>
#include <stdexcept>

// The simulation pushes events onto a fixed-size queue that it never reads
// and never checks for overflow; the analyzer drains it after every input and
// every update. size() keeps counting past the capacity on overflow, so an
// overflow is detectable here even though the overwritten events are lost.
static void drain_events(MatchState &state) {
  if (state.events.size() > MATCH_MAX_EVENTS) {
    throw std::runtime_error(std::format(
        "Simulation event queue overflowed ({} events).", state.events.size()));
  }
  state.events.clear();
}

static void apply_turn(MatchState &state,
                       const std::vector<ReplayEntry> &entries) {
  for (const ReplayEntry &entry : entries) {
    switch (entry.type) {
    case REPLAY_ENTRY_INPUT:
      match_handle_input(state, entry.input);
      drain_events(state);
      break;
    case REPLAY_ENTRY_DISCONNECT:
      // A player who leaves has lost; see "Win/loss rule" in the PRD.
      state.players[entry.disconnect_player_id].mode = PLAYER_MODE_DEFEATED;
      break;
    default:
      break;
    }
  }
}

// The simulation never emits PLAYER_DEFEATED, so defeat is found by watching
// each player's mode.
static void record_defeats(const MatchState &state, uint32_t tick,
                           Analysis &analysis) {
  for (uint32_t slot = 0; slot < MAX_PLAYERS; slot++) {
    PlayerAnalysis &player = analysis.players[slot];
    if (state.players[slot].mode == PLAYER_MODE_DEFEATED &&
        !player.defeated_at_tick.has_value()) {
      player.defeated_at_tick = tick;
    }
  }
}

Analysis analyze_replay(const Replay &replay) {
  const ReplayHeader &header = replay.header;

  // match_init changes the raw map (it removes the gold mines it extracts),
  // and match_spawn_players must see that changed map, so both get one copy.
  auto raw_map = std::make_unique<RawMap>(*header.raw_map);
  MatchPlayer players[MAX_PLAYERS];
  std::copy(std::begin(header.players), std::end(header.players), players);

  auto state = std::make_unique<MatchState>();
  match_init(*state, players, header.map_type, raw_map.get(), header.lcg_seed);
  match_spawn_players(*state, raw_map.get());
  drain_events(*state);

  Analysis analysis = {};
  analysis.duration_ticks = replay.turns.size() * TICKS_PER_TURN;

  for (uint32_t tick = 0; tick < analysis.duration_ticks; tick++) {
    if (tick % TICKS_PER_TURN == 0) {
      apply_turn(*state, replay.turns[tick / TICKS_PER_TURN]);
    }
    match_update(*state);
    drain_events(*state);
    record_defeats(*state, tick, analysis);
  }

  return analysis;
}
