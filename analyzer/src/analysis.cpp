#include "analysis.h"

#include <algorithm>
#include <cmath>
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

// Inputs carry no player id, so an input belongs to whoever owns the first
// entity it refers to. Returns ID_NULL for inputs that refer to no entity.
static EntityId first_entity_id(const MatchInput &input) {
  switch (input.type) {
  case MATCH_INPUT_MOVE_CELL:
  case MATCH_INPUT_MOVE_ENTITY:
  case MATCH_INPUT_MOVE_ATTACK_CELL:
  case MATCH_INPUT_MOVE_ATTACK_ENTITY:
  case MATCH_INPUT_MOVE_REPAIR:
  case MATCH_INPUT_MOVE_UNLOAD:
  case MATCH_INPUT_MOVE_MOLOTOV:
    return input.move.entity_count > 0 ? input.move.entity_ids[0] : ID_NULL;
  case MATCH_INPUT_STOP:
  case MATCH_INPUT_DEFEND:
    return input.stop.entity_count > 0 ? input.stop.entity_ids[0] : ID_NULL;
  case MATCH_INPUT_BUILD:
    return input.build.entity_count > 0 ? input.build.entity_ids[0] : ID_NULL;
  case MATCH_INPUT_BUILD_CANCEL:
    return input.build_cancel.building_id;
  case MATCH_INPUT_BUILDING_ENQUEUE:
    return input.building_enqueue.building_count > 0
               ? input.building_enqueue.building_ids[0]
               : ID_NULL;
  case MATCH_INPUT_BUILDING_DEQUEUE:
    return input.building_dequeue.building_id;
  case MATCH_INPUT_RALLY:
    return input.rally.building_count > 0 ? input.rally.building_ids[0]
                                          : ID_NULL;
  case MATCH_INPUT_SINGLE_UNLOAD:
    return input.single_unload.entity_id;
  case MATCH_INPUT_UNLOAD:
    return input.unload.carrier_count > 0 ? input.unload.carrier_ids[0]
                                          : ID_NULL;
  case MATCH_INPUT_CAMO:
  case MATCH_INPUT_DECAMO:
    return input.camo.unit_count > 0 ? input.camo.unit_ids[0] : ID_NULL;
  case MATCH_INPUT_PATROL:
    return input.patrol.unit_count > 0 ? input.patrol.unit_ids[0] : ID_NULL;
  default:
    return ID_NULL;
  }
}

// Credits the input to its owner's APM. Must run before the input is applied,
// since applying it can remove the entity it refers to. Inputs whose entity
// no longer exists are left uncredited.
static void credit_input(const MatchState &state, const MatchInput &input,
                         uint32_t tick, Analysis &analysis) {
  EntityId entity_id = first_entity_id(input);
  if (entity_id >= ID_MAX) {
    return;
  }
  uint32_t entity_index = state.entities.get_index_of(entity_id);
  if (entity_index == INDEX_INVALID) {
    return;
  }
  uint8_t owner = state.entities[entity_index].player_id;
  if (owner >= MAX_PLAYERS) {
    return;
  }
  analysis.players[owner].series.apm_per_minute[tick / TICKS_PER_MINUTE]++;
}

static void apply_turn(MatchState &state,
                       const std::vector<ReplayEntry> &entries, uint32_t tick,
                       Analysis &analysis) {
  for (const ReplayEntry &entry : entries) {
    switch (entry.type) {
    case REPLAY_ENTRY_INPUT:
      credit_input(state, entry.input, tick, analysis);
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

static bool is_army_unit(EntityType type) {
  return type >= ENTITY_COWBOY && type <= ENTITY_BALLOON;
}

static void take_sample(const MatchState &state, Analysis &analysis) {
  uint32_t army_population[MAX_PLAYERS] = {};
  uint32_t army_value[MAX_PLAYERS] = {};
  for (uint32_t index = 0; index < state.entities.size(); index++) {
    const Entity &entity = state.entities[index];
    if (is_army_unit(entity.type) && entity.health != 0 &&
        entity.player_id < MAX_PLAYERS) {
      const EntityData &data = entity_get_data(entity.type);
      army_population[entity.player_id] += data.unit_data.population_cost;
      army_value[entity.player_id] += data.gold_cost;
    }
  }

  for (uint8_t slot = 0; slot < MAX_PLAYERS; slot++) {
    PlayerSeries &series = analysis.players[slot].series;
    series.gold.push_back(state.players[slot].gold);
    series.gold_mined.push_back(state.players[slot].gold_mined_total);
    series.population.push_back(match_get_player_population(state, slot));
    series.max_population.push_back(
        match_get_player_max_population(state, slot));
    series.army_population.push_back(army_population[slot]);
    series.army_value.push_back(army_value[slot]);
  }
}

static double round_to_tenths(double value) {
  return std::round(value * 10.0) / 10.0;
}

static PlayerSummary summarize(const PlayerAnalysis &player,
                               uint32_t duration_ticks) {
  const PlayerSeries &series = player.series;

  uint32_t ticks_in_match = player.defeated_at_tick.has_value()
                                ? *player.defeated_at_tick + 1
                                : duration_ticks;
  uint32_t inputs = 0;
  for (uint32_t count : series.apm_per_minute) {
    inputs += count;
  }
  double minutes_in_match = (double)ticks_in_match / TICKS_PER_MINUTE;

  return {
      .apm = round_to_tenths(inputs / minutes_in_match),
      .gold_mined_total = series.gold_mined.back(),
      .peak_army_population = std::ranges::max(series.army_population),
      .peak_army_value = std::ranges::max(series.army_value),
  };
}

static uint32_t divide_rounding_up(uint32_t a, uint32_t b) {
  return (a + b - 1) / b;
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
  uint32_t minutes =
      divide_rounding_up(analysis.duration_ticks, TICKS_PER_MINUTE);
  for (PlayerAnalysis &player : analysis.players) {
    player.series.apm_per_minute.assign(minutes, 0);
  }

  for (uint32_t tick = 0; tick < analysis.duration_ticks; tick++) {
    if (tick % TICKS_PER_TURN == 0) {
      apply_turn(*state, replay.turns[tick / TICKS_PER_TURN], tick, analysis);
    }
    match_update(*state);
    drain_events(*state);
    record_defeats(*state, tick, analysis);

    bool is_last_tick = tick + 1 == analysis.duration_ticks;
    if ((tick + 1) % SAMPLE_INTERVAL_TICKS == 0 || is_last_tick) {
      take_sample(*state, analysis);
    }
  }

  for (PlayerAnalysis &player : analysis.players) {
    player.summary = summarize(player, analysis.duration_ticks);
  }
  return analysis;
}
