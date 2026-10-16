#include "analysis.h"

#include "simulation/state/upgrade.h"
#include <algorithm>
#include <cmath>
#include <format>
#include <iterator>
#include <memory>
#include <stdexcept>

// What the analyzer keeps track of while the match runs, besides the
// Analysis it fills in.
struct KnownEntity {
  uint8_t owner;
  EntityType type;
};

struct Observer {
  // The owner and type of every entity id, as of its creation. The
  // simulation reuses ids, so events are looked up here rather than in the
  // live state, where the entity may already be gone or replaced.
  KnownEntity entities[ID_MAX];
  // Each player's completed upgrades as of the previous tick.
  uint32_t upgrades[MAX_PLAYERS];
  // Whether each player was supply blocked in the previous tick.
  bool supply_blocked[MAX_PLAYERS];
};

// Ids in events come from the simulation, so they are always in range.
static KnownEntity &known_entity(Observer &observer, EntityId id) {
  if (id >= ID_MAX) {
    throw std::runtime_error(
        std::format("Simulation event has entity id {}.", id));
  }
  return observer.entities[id];
}

static void remember_entity(const MatchState &state, EntityId id,
                            Observer &observer) {
  const Entity &entity = state.entities.get_by_id(id);
  known_entity(observer, id) = {.owner = entity.player_id, .type = entity.type};
}

static bool is_army_unit(EntityType type) {
  return type >= ENTITY_COWBOY && type <= ENTITY_BALLOON;
}

// Landmines are building types in the simulation, but they are placed by
// sappers with energy, not built, so they don't count as buildings here.
static bool counts_as_building(EntityType type) {
  return entity_is_building(type) && type != ENTITY_LANDMINE;
}

static bool is_player(uint8_t player_id) { return player_id < MAX_PLAYERS; }

static void record_event(const MatchState &state, const MatchEvent &event,
                         uint32_t tick, Observer &observer,
                         Analysis &analysis) {
  switch (event.type) {
  case MATCH_EVENT_ENTITY_PURCHASED:
    analysis.build_order.push_back({
        .tick = tick,
        .slot = event.entity_purchased.player_id,
        .entity_type = event.entity_purchased.entity_type,
        .action = BUILD_PURCHASED,
    });
    break;
  case MATCH_EVENT_UNIT_CANCELLED:
    analysis.build_order.push_back({
        .tick = tick,
        .slot = event.unit_cancelled.player_id,
        .entity_type = event.unit_cancelled.entity_type,
        .action = BUILD_CANCELLED,
    });
    break;
  case MATCH_EVENT_BUILDING_CANCELLED: {
    const KnownEntity &building =
        known_entity(observer, event.building_cancelled.building_id);
    analysis.build_order.push_back({
        .tick = tick,
        .slot = building.owner,
        .entity_type = building.type,
        .action = BUILD_CANCELLED,
    });
    // It was counted as built when it was placed.
    if (counts_as_building(building.type)) {
      analysis.players[building.owner].summary.buildings_built--;
    }
    break;
  }
  case MATCH_EVENT_ENTITY_CREATED: {
    EntityId id = event.entity_created.entity_id;
    remember_entity(state, id, observer);
    uint8_t owner = known_entity(observer, id).owner;
    EntityType type = known_entity(observer, id).type;
    if (!is_player(owner)) {
      break;
    }
    if (entity_is_unit(type)) {
      analysis.players[owner].units_built_by_type[type]++;
      analysis.players[owner].summary.units_built++;
    } else if (counts_as_building(type)) {
      analysis.players[owner].summary.buildings_built++;
    }
    break;
  }
  case MATCH_EVENT_ENTITY_KILLED: {
    const KnownEntity &attacker =
        known_entity(observer, event.entity_killed.attacker_id);
    const KnownEntity &defender_entity =
        known_entity(observer, event.entity_killed.defender_id);
    Kill kill = {
        .tick = tick,
        .attacker_slot = attacker.owner,
        .attacker_type = attacker.type,
        .defender_slot = defender_entity.owner,
        .defender_type = defender_entity.type,
    };
    // Only fights between players are kept, not e.g. a destroyed crate.
    if (!is_player(kill.attacker_slot) || !is_player(kill.defender_slot)) {
      break;
    }
    analysis.kills.push_back(kill);
    if (!entity_is_unit(kill.defender_type)) {
      break;
    }
    PlayerAnalysis &defender = analysis.players[kill.defender_slot];
    defender.units_lost_by_type[kill.defender_type]++;
    defender.summary.units_lost++;
    if (state.players[kill.attacker_slot].team !=
        state.players[kill.defender_slot].team) {
      analysis.players[kill.attacker_slot].summary.kills++;
    }
    break;
  }
  case MATCH_EVENT_RESEARCH_PURCHASED:
    analysis.upgrades.push_back({
        .tick = tick,
        .slot = event.research_purchased.player_id,
        .upgrade = event.research_purchased.upgrade,
        .action = UPGRADE_PURCHASED,
    });
    break;
  case MATCH_EVENT_RESEARCH_CANCELLED:
    analysis.upgrades.push_back({
        .tick = tick,
        .slot = event.research_cancelled.player_id,
        .upgrade = event.research_cancelled.upgrade,
        .action = UPGRADE_CANCELLED,
    });
    break;
  default:
    // RESEARCH_COMPLETE and PLAYER_DEFEATED are never emitted; completion
    // and defeat are found by diffing player state instead. SUPPLY_BLOCKED
    // is only emitted when a queue changes, not when a building becomes
    // blocked during an update, so supply blocks come from
    // record_supply_blocked instead.
    break;
  }
}

// The simulation pushes events onto a fixed-size queue that it never reads
// and never checks for overflow; the analyzer drains it after every input and
// every update. size() keeps counting past the capacity on overflow, so an
// overflow is detectable here even though the overwritten events are lost.
static void record_events(MatchState &state, uint32_t tick, Observer &observer,
                          Analysis &analysis) {
  if (state.events.size() > MATCH_MAX_EVENTS) {
    throw std::runtime_error(std::format(
        "Simulation event queue overflowed ({} events).", state.events.size()));
  }
  while (!state.events.empty()) {
    record_event(state, state.events.front(), tick, observer, analysis);
    state.events.pop();
  }
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
  if (!is_player(owner)) {
    return;
  }
  analysis.players[owner].series.apm_per_minute[tick / TICKS_PER_MINUTE]++;
}

static void apply_turn(MatchState &state,
                       const std::vector<ReplayEntry> &entries, uint32_t tick,
                       Observer &observer, Analysis &analysis) {
  for (const ReplayEntry &entry : entries) {
    switch (entry.type) {
    case REPLAY_ENTRY_INPUT:
      credit_input(state, entry.input, tick, analysis);
      match_handle_input(state, entry.input);
      record_events(state, tick, observer, analysis);
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

// The simulation never emits RESEARCH_COMPLETE, so completion is found by
// watching each player's upgrade bits.
static void record_completed_upgrades(const MatchState &state, uint32_t tick,
                                      Observer &observer, Analysis &analysis) {
  for (uint8_t slot = 0; slot < MAX_PLAYERS; slot++) {
    uint32_t completed =
        state.players[slot].upgrades & ~observer.upgrades[slot];
    observer.upgrades[slot] = state.players[slot].upgrades;
    for (uint32_t bit = 0; bit < UPGRADE_COUNT; bit++) {
      uint32_t upgrade = 1U << bit;
      if ((completed & upgrade) != 0) {
        analysis.upgrades.push_back({
            .tick = tick,
            .slot = slot,
            .upgrade = upgrade,
            .action = UPGRADE_COMPLETED,
        });
        analysis.players[slot].summary.upgrades_completed++;
      }
    }
  }
}

// A player is supply blocked in a tick when at least one of their buildings
// can't start its next unit. Each run of blocked ticks counts as one block.
// A player at the population cap isn't counted: more houses wouldn't help.
static void record_supply_blocked(const MatchState &state, Observer &observer,
                                  Analysis &analysis) {
  bool blocked[MAX_PLAYERS] = {};
  for (uint32_t index = 0; index < state.entities.size(); index++) {
    const Entity &entity = state.entities[index];
    if (entity_is_building(entity.type) &&
        entity.mode == MODE_BUILDING_FINISHED &&
        entity.timer == BUILDING_QUEUE_BLOCKED && is_player(entity.player_id)) {
      blocked[entity.player_id] = true;
    }
  }
  for (uint8_t slot = 0; slot < MAX_PLAYERS; slot++) {
    if (blocked[slot] &&
        match_get_player_max_population(state, slot) == MATCH_MAX_POPULATION) {
      blocked[slot] = false;
    }
  }
  for (uint32_t slot = 0; slot < MAX_PLAYERS; slot++) {
    PlayerSummary &summary = analysis.players[slot].summary;
    if (blocked[slot]) {
      summary.supply_blocked_ticks++;
    }
    if (blocked[slot] && !observer.supply_blocked[slot]) {
      summary.supply_blocked_count++;
    }
    observer.supply_blocked[slot] = blocked[slot];
  }
}

static void take_sample(const MatchState &state, Analysis &analysis) {
  uint32_t army_population[MAX_PLAYERS] = {};
  uint32_t army_value[MAX_PLAYERS] = {};
  for (uint32_t index = 0; index < state.entities.size(); index++) {
    const Entity &entity = state.entities[index];
    if (is_army_unit(entity.type) && entity.health != 0 &&
        is_player(entity.player_id)) {
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

// Fills in the summary fields that come from the time series.
static void summarize_series(PlayerAnalysis &player, uint32_t duration_ticks) {
  const PlayerSeries &series = player.series;
  PlayerSummary &summary = player.summary;

  uint32_t ticks_in_match = player.defeated_at_tick.has_value()
                                ? *player.defeated_at_tick + 1
                                : duration_ticks;
  uint32_t inputs = 0;
  for (uint32_t count : series.apm_per_minute) {
    inputs += count;
  }
  double minutes_in_match = (double)ticks_in_match / TICKS_PER_MINUTE;

  summary.apm = round_to_tenths(inputs / minutes_in_match);
  summary.gold_mined_total = series.gold_mined.back();
  summary.peak_army_population = std::ranges::max(series.army_population);
  summary.peak_army_value = std::ranges::max(series.army_value);
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
  // The starting entities' events are thrown away, so starting units don't
  // count as built.
  state->events.clear();

  auto observer = std::make_unique<Observer>();
  for (uint32_t index = 0; index < state->entities.size(); index++) {
    remember_entity(*state, state->entities.get_id_of(index), *observer);
  }
  for (uint8_t slot = 0; slot < MAX_PLAYERS; slot++) {
    observer->upgrades[slot] = state->players[slot].upgrades;
  }

  Analysis analysis = {};
  analysis.duration_ticks = replay.turns.size() * TICKS_PER_TURN;
  uint32_t minutes =
      divide_rounding_up(analysis.duration_ticks, TICKS_PER_MINUTE);
  for (PlayerAnalysis &player : analysis.players) {
    player.series.apm_per_minute.assign(minutes, 0);
  }

  for (uint32_t tick = 0; tick < analysis.duration_ticks; tick++) {
    if (tick % TICKS_PER_TURN == 0) {
      apply_turn(*state, replay.turns[tick / TICKS_PER_TURN], tick, *observer,
                 analysis);
    }
    match_update(*state);
    record_events(*state, tick, *observer, analysis);
    record_defeats(*state, tick, analysis);
    record_completed_upgrades(*state, tick, *observer, analysis);
    record_supply_blocked(*state, *observer, analysis);

    bool is_last_tick = tick + 1 == analysis.duration_ticks;
    if ((tick + 1) % SAMPLE_INTERVAL_TICKS == 0 || is_last_tick) {
      take_sample(*state, analysis);
    }
  }

  for (PlayerAnalysis &player : analysis.players) {
    summarize_series(player, analysis.duration_ticks);
  }
  return analysis;
}

const char *entity_type_name(EntityType type) {
  switch (type) {
  case ENTITY_GOLDMINE:
    return "goldmine";
  case ENTITY_CRATE:
    return "crate";
  case ENTITY_SWITCH:
    return "switch";
  case ENTITY_MINER:
    return "miner";
  case ENTITY_COWBOY:
    return "cowboy";
  case ENTITY_BANDIT:
    return "bandit";
  case ENTITY_WAGON:
    return "wagon";
  case ENTITY_JOCKEY:
    return "jockey";
  case ENTITY_SAPPER:
    return "sapper";
  case ENTITY_PYRO:
    return "pyro";
  case ENTITY_SOLDIER:
    return "soldier";
  case ENTITY_CANNON:
    return "cannon";
  case ENTITY_DETECTIVE:
    return "detective";
  case ENTITY_BALLOON:
    return "balloon";
  case ENTITY_HALL:
    return "hall";
  case ENTITY_HOUSE:
    return "house";
  case ENTITY_SALOON:
    return "saloon";
  case ENTITY_BUNKER:
    return "bunker";
  case ENTITY_WORKSHOP:
    return "workshop";
  case ENTITY_SMITH:
    return "smith";
  case ENTITY_COOP:
    return "coop";
  case ENTITY_BARRACKS:
    return "barracks";
  case ENTITY_SHERIFFS:
    return "sheriffs";
  case ENTITY_LANDMINE:
    return "landmine";
  default:
    throw std::runtime_error(std::format("Unknown entity type {}.", (int)type));
  }
}

const char *upgrade_name(uint32_t upgrade) {
  switch (upgrade) {
  case UPGRADE_WAR_WAGON:
    return "war_wagon";
  case UPGRADE_LANDMINES:
    return "landmines";
  case UPGRADE_BAYONETS:
    return "bayonets";
  case UPGRADE_PRIVATE_EYE:
    return "private_eye";
  case UPGRADE_GETAWAY_BOOTS:
    return "getaway_boots";
  case UPGRADE_IRON_SIGHTS:
    return "iron_sights";
  default:
    throw std::runtime_error(std::format("Unknown upgrade {}.", upgrade));
  }
}

const char *build_action_name(BuildAction action) {
  return action == BUILD_PURCHASED ? "purchased" : "cancelled";
}

const char *upgrade_action_name(UpgradeAction action) {
  switch (action) {
  case UPGRADE_PURCHASED:
    return "purchased";
  case UPGRADE_CANCELLED:
    return "cancelled";
  default:
    return "completed";
  }
}
