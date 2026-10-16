#include "match.h"

#include "simulation/defines.h"
#include "simulation/state/map_gen.h"
#include "simulation/shared/match_setting.h"
#include "simulation/state/upgrade.h"
#include "simulation/util/lcg.h"

static const fixed PROJECTILE_MOLOTOV_SPEED = fixed::from_int(8);

static const uint32_t FIRE_TTL = 30U * 60U;
static const uint32_t MATCH_PLAYER_STARTING_GOLD = 50;
static const uint32_t MATCH_GOLDMINE_STARTING_GOLD = 7500U;

// INIT

void match_init(MatchState& state, MatchPlayer players[MAX_PLAYERS], MapType map_type, RawMap* raw_map, int32_t lcg_seed) {
    // Extract goldmines from map
    const std::vector<ivec2> goldmines = raw_map_extract_goldmines(raw_map);

    // LCG seed
    state.lcg_seed = lcg_seed;

    // Players
    memcpy(state.players, players, sizeof(state.players));

    // Fog and detection
    for (uint8_t team = 0; team < MAX_PLAYERS; team++) {
        for (int index = 0; index < raw_map->width * raw_map->height; index++) {
            state.fog[team][index] = FOG_HIDDEN;
            state.detection[team][index] = 0;
        }
    }

    // Fire cells
    memset(state.fire_cells, 0, sizeof(state.fire_cells));

    // Init map
    map_init(state.map, map_type, raw_map, &state.lcg_seed);

    // Create goldmines
    for (uint32_t goldmine_index = 0; goldmine_index < goldmines.size(); goldmine_index++) {
        entity_create_misc(state, ENTITY_GOLDMINE, goldmines[goldmine_index], MATCH_GOLDMINE_STARTING_GOLD);
    }
}

void match_spawn_players(MatchState& state, const RawMap* raw_map) {
    const uint32_t PLAYER_SPAWN_NOT_YET_CHOSEN = UINT32_MAX;

    // Determine player spawn indices
    uint32_t player_spawn_index[MAX_PLAYERS];
    bool is_spawn_index_available[MAX_PLAYERS];
    uint32_t team_player_count[MAX_PLAYERS];
    memset(team_player_count, 0, sizeof(team_player_count));
    for (uint8_t player_id = 0; player_id < MAX_PLAYERS; player_id++) {
        player_spawn_index[player_id] = PLAYER_SPAWN_NOT_YET_CHOSEN;

        uint8_t player_team = state.players[player_id].team;
        team_player_count[player_team]++;

        is_spawn_index_available[player_id] = true;
    }

    uint32_t spawn_index = (uint32_t)(lcg_rand(&state.lcg_seed) % MAX_PLAYERS);
    while (true) {
        // Find the biggest team without a spawn point
        uint32_t biggest_team = MAX_PLAYERS;
        for (uint32_t team = 0; team < MAX_PLAYERS; team++) {
            if (team_player_count[team] == 0) {
                continue;
            }
            if (biggest_team == MAX_PLAYERS || team_player_count[team] > team_player_count[biggest_team]) {
                biggest_team = team;
            }
        }

        // If no team found, then exit
        if (biggest_team == MAX_PLAYERS) {
            break;
        }

        uint32_t team_spawn_index = spawn_index;
        for (uint8_t player_id = 0; player_id < MAX_PLAYERS; player_id++) {
            if (state.players[player_id].mode != PLAYER_MODE_ACTIVE ||
                    state.players[player_id].team != biggest_team) {
                continue;
            }

            while (!is_spawn_index_available[team_spawn_index]) {
                team_spawn_index = (team_spawn_index + 1) % MAX_PLAYERS;
            }

            player_spawn_index[player_id] = team_spawn_index;
            is_spawn_index_available[team_spawn_index] = false;
        }

        team_player_count[biggest_team] = 0;
        spawn_index = (spawn_index + 2) % MAX_PLAYERS;
    }

    // Zero-init player structs
    for (uint8_t player_id = 0; player_id < MAX_PLAYERS; player_id++) {
        state.players[player_id].gold = MATCH_PLAYER_STARTING_GOLD;
        state.players[player_id].gold_mined_total = 0;
        state.players[player_id].upgrades = 0;
        state.players[player_id].upgrades_in_progress = 0;
    }

    // Init player entities using the spawn indices
    for (uint8_t player_id = 0; player_id < MAX_PLAYERS; player_id++) {
        if (state.players[player_id].mode != PLAYER_MODE_ACTIVE) {
            continue;
        }

        // Create town hall
        ivec2 player_hall_cell = raw_map_get_player_hall_location(raw_map, player_spawn_index[player_id]);
        entity_create_finished_building(state, ENTITY_HALL, player_hall_cell, player_id);

        // Determine miner spawn location
        const int miner_x = player_hall_cell.x < (raw_map->width / 2)
            ? player_hall_cell.x
            : player_hall_cell.x + 1;
        const int miner_y = player_hall_cell.y < (raw_map->height / 2)
            ? player_hall_cell.y - 1
            : player_hall_cell.y + entity_get_data(ENTITY_HALL).cell_size;

        // Create miners
        entity_create(state, ENTITY_MINER, ivec2(miner_x, miner_y), player_id);
        entity_create(state, ENTITY_MINER, ivec2(miner_x + 1, miner_y), player_id);
        entity_create(state, ENTITY_MINER, ivec2(miner_x + 2, miner_y), player_id);

        // Create wagon
        const int wagon_x = player_hall_cell.x < (raw_map->width / 2)
            ? player_hall_cell.x
            : player_hall_cell.x + 2;
        const int wagon_y = player_hall_cell.y < (raw_map->height / 2)
            ? player_hall_cell.y + entity_get_data(ENTITY_HALL).cell_size
            : player_hall_cell.y - entity_get_data(ENTITY_WAGON).cell_size;
        entity_create(state, ENTITY_WAGON, ivec2(wagon_x, wagon_y), player_id);
    }
}

// UPDATE

void match_handle_input(MatchState& state, const MatchInput& input) {
    switch (input.type) {
        case MATCH_INPUT_NONE:
            return;
        case MATCH_INPUT_MOVE_CELL:
        case MATCH_INPUT_MOVE_ENTITY:
        case MATCH_INPUT_MOVE_ATTACK_CELL:
        case MATCH_INPUT_MOVE_ATTACK_ENTITY:
        case MATCH_INPUT_MOVE_REPAIR:
        case MATCH_INPUT_MOVE_UNLOAD: {
            // Determine the target index
            uint32_t target_index = INDEX_INVALID;
            if (input.type == MATCH_INPUT_MOVE_ENTITY ||
                    input.type == MATCH_INPUT_MOVE_ATTACK_ENTITY ||
                    input.type == MATCH_INPUT_MOVE_REPAIR) {
                target_index = state.entities.get_index_of(input.move.target_id);
                // Don't target a unit which is no longer selectable
                if (target_index != INDEX_INVALID && !entity_is_selectable(state.entities[target_index])) {
                    target_index = INDEX_INVALID;
                }
            }

            // Calculate group center
            ivec2 group_center;
            bool should_move_as_group = target_index == INDEX_INVALID;
            uint32_t unit_count = 0;
            if (should_move_as_group) {
                ivec2 group_min;
                ivec2 group_max;
                for (uint32_t id_index = 0; id_index < input.move.entity_count; id_index++) {
                    uint32_t entity_index = state.entities.get_index_of(input.move.entity_ids[id_index]);
                    if (entity_index == INDEX_INVALID || !entity_is_selectable(state.entities[entity_index])) {
                        continue;
                    }

                    ivec2 entity_cell = state.entities[entity_index].cell;
                    if (unit_count == 0) {
                        group_min = entity_cell;
                        group_max = entity_cell;
                    } else {
                        group_min.x = std::min(group_min.x, entity_cell.x);
                        group_min.y = std::min(group_min.y, entity_cell.y);
                        group_max.x = std::max(group_max.x, entity_cell.x);
                        group_max.y = std::max(group_max.y, entity_cell.y);
                    }

                    unit_count++;
                }

                Rect group_rect = (Rect) {
                    .x = group_min.x, .y = group_min.y,
                    .w = group_max.x - group_min.x, .h = group_max.y - group_min.y
                };
                group_center = ivec2(group_rect.x + (group_rect.w / 2), group_rect.y + (group_rect.h / 2));

                // Don't move as group if we're not in a group
                // Also don't move as a group if the target is inside the group rect (this allows units to converge in on a cell)
                if (unit_count < 2 || group_rect.has_point(input.move.target_cell)) {
                    should_move_as_group = false;
                }
            } // End calculate group center

            // Give each unit the move command
            for (uint32_t id_index = 0; id_index < input.move.entity_count; id_index++) {
                uint32_t entity_index = state.entities.get_index_of(input.move.entity_ids[id_index]);
                if (entity_index == INDEX_INVALID || !entity_can_be_given_orders(state, state.entities[entity_index])) {
                    continue;
                }
                Entity& entity = state.entities[entity_index];

                // Set the unit's target
                Target target = target_none();
                target.type = (TargetType)input.type;
                if (target_index == INDEX_INVALID) {
                    target.cell = input.move.target_cell;
                    // If group-moving, use the group move cell, but only if the cell is valid
                    if (should_move_as_group) {
                        ivec2 group_move_cell = input.move.target_cell + (entity.cell - group_center);
                        if (map_is_cell_in_bounds(state.map, group_move_cell) &&
                                ivec2::manhattan_distance(group_move_cell, input.move.target_cell) <= 3 &&
                                map_get_tile(state.map, group_move_cell).elevation == map_get_tile(state.map, input.move.target_cell).elevation &&
                                    !(!map_is_cell_blocked(map_get_cell(state.map, CELL_LAYER_GROUND, input.move.target_cell)) &&
                                    map_is_cell_blocked(map_get_cell(state.map, CELL_LAYER_GROUND, group_move_cell)))) {
                            target.cell = group_move_cell;
                        }
                    }
                // Ensure that units do not target themselves
                } else if (input.move.target_id == input.move.entity_ids[id_index]) {
                    target = target_none();
                } else {
                    target.id = input.move.target_id;
                }

                if (!input.move.shift_command || (entity.target.type == TARGET_NONE && entity.target_queue_index == ENTITY_TARGET_QUEUE_INDEX_NONE)) {
                    entity_target_queue_clear(state, entity);
                    entity_set_target(state, entity, target);
                } else {
                    entity_target_queue_push(state, entity, target);
                }
            } // End for each unit in move input
            break;
        } // End case MATCH_INPUT_MOVE
        case MATCH_INPUT_MOVE_MOLOTOV: {
            uint32_t thrower_index = INDEX_INVALID;
            for (uint32_t id_index = 0; id_index < input.move.entity_count; id_index++) {
                uint32_t unit_index = state.entities.get_index_of(input.move.entity_ids[id_index]);
                if (unit_index == INDEX_INVALID || !entity_is_selectable(state.entities[unit_index])) {
                    continue;
                }
                if (state.entities[unit_index].energy < MOLOTOV_ENERGY_COST) {
                    continue;
                }
                if (thrower_index == INDEX_INVALID ||
                        ivec2::manhattan_distance(state.entities[unit_index].cell, input.move.target_cell) <
                        ivec2::manhattan_distance(state.entities[thrower_index].cell, input.move.target_cell)) {
                    thrower_index = unit_index;
                }
            }

            if (thrower_index == INDEX_INVALID) {
                return;
            }

            Target target = target_molotov(input.move.target_cell);

            if (!input.move.shift_command ||
                    (state.entities[thrower_index].target.type == TARGET_NONE && state.entities[thrower_index].target_queue_index == ENTITY_TARGET_QUEUE_INDEX_NONE)) {
                entity_target_queue_clear(state, state.entities[thrower_index]);
                entity_set_target(state, state.entities[thrower_index], target);
            } else {
                entity_target_queue_push(state, state.entities[thrower_index], target);
            }

            break;
        }
        case MATCH_INPUT_STOP:
        case MATCH_INPUT_DEFEND: {
            for (uint32_t index = 0; index < input.stop.entity_count; index++) {
                uint32_t entity_index = state.entities.get_index_of(input.stop.entity_ids[index]);
                if (entity_index == INDEX_INVALID || !entity_can_be_given_orders(state, state.entities[entity_index])) {
                    continue;
                }

                Entity& entity = state.entities[entity_index];
                entity_path_clear(state, entity);
                entity_target_queue_clear(state, entity);
                entity_set_target(state, entity, target_none());
                if (input.type == MATCH_INPUT_DEFEND) {
                    entity_set_flag(entity, ENTITY_FLAG_HOLD_POSITION, true);
                }
            }

            break;
        }
        case MATCH_INPUT_BUILD: {
            // Determine the list of viable builders
            std::vector<EntityId> builder_ids;
            const EntityData& building_data = entity_get_data((EntityType)input.build.building_type);
            for (uint32_t id_index = 0; id_index < input.build.entity_count; id_index++) {
                uint32_t entity_index = state.entities.get_index_of(input.build.entity_ids[id_index]);
                if (entity_index == INDEX_INVALID || !entity_can_be_given_orders(state, state.entities[entity_index])) {
                    continue;
                }
                builder_ids.push_back(input.build.entity_ids[id_index]);
            }

            // If there's no viable builders, don't build
            if (builder_ids.empty()) {
                return;
            }

            // Get the lead builder
            EntityId lead_builder_id = match_get_nearest_builder(state, builder_ids, input.build.target_cell);
            Entity& lead_builder = state.entities.get_by_id(lead_builder_id);

            // Make sure the player has enough gold / energy to build
            const bool building_costs_energy = (building_data.building_data.options & BUILDING_COSTS_ENERGY) == BUILDING_COSTS_ENERGY;
            const bool can_afford_building =
                (building_costs_energy && lead_builder.energy >= building_data.gold_cost) ||
                (!building_costs_energy && state.players[lead_builder.player_id].gold >= building_data.gold_cost);
            if (!can_afford_building) {
                break;
            }

            // Charge the cost of the building
            if (building_costs_energy) {
                lead_builder.energy -= building_data.gold_cost;
            } else {
                state.players[lead_builder.player_id].gold -= building_data.gold_cost;
                state.events.push({
                    .type = MATCH_EVENT_ENTITY_PURCHASED,
                    .entity_purchased = {
                        .player_id = lead_builder.player_id,
                        .entity_type = (EntityType)input.build.building_type
                    }
                });
            }

            // Assign the lead builder's target
            int building_size = building_data.cell_size;
            Target build_target = target_build((TargetBuild) {
                .unit_cell = input.build.building_type == ENTITY_LANDMINE
                                ? input.build.target_cell
                                : get_nearest_cell_in_rect(
                                    lead_builder.cell,
                                    input.build.target_cell,
                                    building_size),
                .building_cell = input.build.target_cell,
                .building_type = (EntityType)input.build.building_type
            });
            if (!input.move.shift_command || (lead_builder.target.type == TARGET_NONE && lead_builder.target_queue_index == ENTITY_TARGET_QUEUE_INDEX_NONE)) {
                entity_target_queue_clear(state, lead_builder);
                entity_set_target(state, lead_builder, build_target);
            } else {
                entity_target_queue_push(state, lead_builder, build_target);
            }

            // Assign the helpers' target
            if (input.build.building_type != ENTITY_LANDMINE && !input.build.shift_command) {
                for (EntityId builder_id : builder_ids) {
                    if (builder_id == lead_builder_id) {
                        continue;
                    }
                    Entity& builder = state.entities.get_by_id(builder_id);
                    entity_target_queue_clear(state, builder);
                    entity_set_target(state, builder, target_build_assist(lead_builder_id));
                }
            }
            break;
        }
        case MATCH_INPUT_BUILD_CANCEL: {
            uint32_t building_index = state.entities.get_index_of(input.build_cancel.building_id);
            if (building_index == INDEX_INVALID || !entity_is_selectable(state.entities[building_index])) {
                break;
            }

            const EntityData& building_data = entity_get_data(state.entities[building_index].type);
            uint32_t gold_refund = building_data.gold_cost - (((uint32_t)state.entities[building_index].health * building_data.gold_cost) / (uint32_t)building_data.max_health);
            state.players[state.entities[building_index].player_id].gold += gold_refund;

            // Tell the builder to stop building
            for (uint32_t entity_index = 0; entity_index < state.entities.size(); entity_index++) {
                if (state.entities[entity_index].target.type == TARGET_BUILD && state.entities[entity_index].target.id == input.build_cancel.building_id) {
                    Entity& builder = state.entities[entity_index];
                    const EntityData& builder_data = entity_get_data(builder.type);
                    builder.cell = builder.target.build.building_cell;
                    builder.position = entity_get_target_position(builder);
                    builder.target = target_none();
                    builder.mode = MODE_UNIT_IDLE;
                    entity_target_queue_clear(state, builder);
                    map_set_cell_rect(state.map, CELL_LAYER_GROUND, builder.cell, builder_data.cell_size, (Cell) {
                        .type = CELL_UNIT,
                        .id = state.entities.get_id_of(entity_index)
                    });
                    match_fog_update(state, state.players[builder.player_id].team, builder.cell, builder_data.cell_size, builder_data.sight, entity_has_detection(state, builder), builder_data.cell_layer, true);
                    break;
                }
            }

            // Destroy the building
            state.entities[building_index].health = 0;

            // Send an event
            state.events.push({
                .type = MATCH_EVENT_BUILDING_CANCELLED,
                .building_cancelled = {
                    .building_id = input.build_cancel.building_id
                }
            });
            break;
        }
        case MATCH_INPUT_BUILDING_ENQUEUE: {
            // Choose the best building to enqueue out of the selection
            uint32_t building_index = INDEX_INVALID;
            uint32_t shortest_building_queue_duration = 0;
            for (int index = 0; index < input.building_enqueue.building_count; index++) {
                uint32_t candidate_index = state.entities.get_index_of(input.building_enqueue.building_ids[index]);
                if (candidate_index == INDEX_INVALID ||
                        !entity_is_selectable(state.entities[candidate_index]) ||
                        state.entities[candidate_index].queue.size() == BUILDING_QUEUE_MAX) {
                    continue;
                }

                uint32_t building_queue_duration = state.entities[candidate_index].timer;
                for (uint32_t queue_index = 1; queue_index < state.entities[candidate_index].queue.size(); queue_index++) {
                    building_queue_duration += building_queue_item_duration(state.entities[candidate_index].queue[queue_index]);
                }

                if (building_index == INDEX_INVALID ||
                        building_queue_duration < shortest_building_queue_duration) {
                    building_index = candidate_index;
                    shortest_building_queue_duration = building_queue_duration;
                }
            }
            if (building_index == INDEX_INVALID) {
                return;
            }

            Entity& building = state.entities[building_index];

            // Parse the building queue item
            BuildingQueueItem item;
            item.type = (BuildingQueueItemType)input.building_enqueue.item_type;
            switch (item.type) {
                case BUILDING_QUEUE_ITEM_UNIT:
                    item.unit_type = (EntityType)input.building_enqueue.item_subtype;
                    break;
                case BUILDING_QUEUE_ITEM_UPGRADE:
                    item.upgrade = input.building_enqueue.item_subtype;
                    break;
            }

            // Make sure the player can afford the item
            if (state.players[building.player_id].gold < building_queue_item_cost(item)) {
                return;
            }

            // Reject this enqueue if the upgrade is already being researched
            if (item.type == BUILDING_QUEUE_ITEM_UPGRADE && !match_player_upgrade_is_available(state, building.player_id, item.upgrade)) {
                return;
            }

            // Mark upgrades as in-progress when we enqueue them
            if (item.type == BUILDING_QUEUE_ITEM_UPGRADE) {
                state.players[building.player_id].upgrades_in_progress |= item.upgrade;
            }

            state.players[building.player_id].gold -= building_queue_item_cost(item);
            entity_building_enqueue(state, building, item);

            // Send event
            if (item.type == BUILDING_QUEUE_ITEM_UNIT) {
                state.events.push({
                    .type = MATCH_EVENT_ENTITY_PURCHASED,
                    .entity_purchased = {
                        .player_id = building.player_id,
                        .entity_type = (EntityType)item.unit_type
                    }
                });
            } else if (item.type == BUILDING_QUEUE_ITEM_UPGRADE) {
                state.events.push({
                    .type = MATCH_EVENT_RESEARCH_PURCHASED,
                    .research_purchased = {
                        .player_id = building.player_id,
                        .upgrade = item.upgrade
                    }
                });
            }

            break;
        }
        case MATCH_INPUT_BUILDING_DEQUEUE: {
            uint32_t building_index = state.entities.get_index_of(input.building_dequeue.building_id);
            if (building_index == INDEX_INVALID || !entity_is_selectable(state.entities[building_index])) {
                return;
            }

            Entity& building = state.entities[building_index];
            if (building.queue.empty()) {
                return;
            }

            uint32_t index = input.building_dequeue.index == BUILDING_DEQUEUE_POP_FRONT
                                    ? (uint32_t)building.queue.size() - 1
                                    : input.building_dequeue.index;
            if (index >= building.queue.size()) {
                return;
            }

            state.players[building.player_id].gold += building_queue_item_cost(building.queue[index]);
            if (building.queue[index].type == BUILDING_QUEUE_ITEM_UPGRADE) {
                state.players[building.player_id].upgrades_in_progress &= ~building.queue[index].upgrade;
            }

            // Send event
            if (building.queue[index].type == BUILDING_QUEUE_ITEM_UNIT) {
                state.events.push({
                    .type = MATCH_EVENT_UNIT_CANCELLED,
                    .unit_cancelled = {
                        .player_id = building.player_id,
                        .entity_type = building.queue[index].unit_type
                    }
                });
            } else if (building.queue[index].type == BUILDING_QUEUE_ITEM_UPGRADE) {
                state.events.push({
                    .type = MATCH_EVENT_RESEARCH_CANCELLED,
                    .research_cancelled = {
                        .player_id = building.player_id,
                        .upgrade = building.queue[index].upgrade
                    }
                });
            }

            if (index == 0) {
                entity_building_dequeue(state, building);
            } else {
                building.queue.remove_at_ordered(index);
            }
            break;
        }
        case MATCH_INPUT_RALLY: {
            for (uint32_t id_index = 0; id_index < input.rally.building_count; id_index++) {
                uint32_t building_index = state.entities.get_index_of(input.rally.building_ids[id_index]);
                if (building_index == INDEX_INVALID || !entity_is_selectable(state.entities[building_index])) {
                    continue;
                }

                state.entities[building_index].rally_point = input.rally.rally_point;
            }
            break;
        }
        case MATCH_INPUT_SINGLE_UNLOAD: {
            uint32_t garrisoned_unit_index = state.entities.get_index_of(input.single_unload.entity_id);
            if (garrisoned_unit_index == INDEX_INVALID ||
                    state.entities[garrisoned_unit_index].health == 0 ||
                    state.entities[garrisoned_unit_index].garrison_id == ID_NULL) {
                return;
            }

            Entity& carrier = state.entities.get_by_id(state.entities[garrisoned_unit_index].garrison_id);
            entity_unload_unit(state, carrier, input.single_unload.entity_id);

            break;
        }
        case MATCH_INPUT_UNLOAD: {
            for (uint32_t id_index = 0; id_index < input.unload.carrier_count; id_index++) {
                uint32_t carrier_index = state.entities.get_index_of(input.unload.carrier_ids[id_index]);
                if (carrier_index == INDEX_INVALID ||
                        !entity_is_selectable(state.entities[carrier_index]) ||
                        state.entities[carrier_index].garrisoned_units.empty()) {
                    continue;
                }

                Entity& carrier = state.entities[carrier_index];
                entity_unload_unit(state, carrier, ENTITY_UNLOAD_ALL);
            }
            break;
        }
        case MATCH_INPUT_CAMO:
        case MATCH_INPUT_DECAMO: {
            for (uint32_t id_index = 0; id_index < input.camo.unit_count; id_index++) {
                uint32_t unit_index = state.entities.get_index_of(input.camo.unit_ids[id_index]);
                if (unit_index == INDEX_INVALID || !entity_is_selectable(state.entities[unit_index])) {
                    continue;
                }

                Entity& unit = state.entities[unit_index];
                if (input.type == MATCH_INPUT_CAMO && unit.energy < CAMO_ENERGY_COST) {
                    continue;
                }
                if (input.type == MATCH_INPUT_CAMO) {
                    unit.energy -= CAMO_ENERGY_COST;
                }
                entity_set_flag(unit, ENTITY_FLAG_INVISIBLE, input.type == MATCH_INPUT_CAMO);
                unit.energy_regen_timer = entity_get_energy_regen_duration(unit);

                if (input.type == MATCH_INPUT_CAMO && unit.target.type == TARGET_ATTACK_ENTITY) {
                    unit.mode = MODE_UNIT_IDLE;
                    unit.target = target_none();
                    entity_set_flag(unit, ENTITY_FLAG_ATTACK_SPECIFIC_ENTITY, false);
                }
            }
            break;
        }
        case MATCH_INPUT_PATROL: {
            for (uint32_t id_index = 0; id_index < input.patrol.unit_count; id_index++) {
                EntityId entity_id = input.patrol.unit_ids[id_index];
                uint32_t entity_index = state.entities.get_index_of(entity_id);
                if (entity_index == INDEX_INVALID ||
                        !entity_can_be_given_orders(state, state.entities[entity_index])) {
                    continue;
                }

                entity_set_target(state, state.entities[entity_index], target_patrol(input.patrol.target_cell_a, input.patrol.target_cell_b));
            }
            break;
        }
        case MATCH_INPUT_TYPE_COUNT: {
            break;
        }
    }
}

void match_update(MatchState& state) {
    // Update entities
    for (uint32_t entity_index = 0; entity_index < state.entities.size(); entity_index++) {
        entity_update(state, entity_index);
    }

    // Update particles
    {
        uint32_t particle_index = 0;
        while (particle_index < state.particles.size()) {
            animation_update(state.particles[particle_index].animation);

            // On particle finish, remove particle
            if (!animation_is_playing(state.particles[particle_index].animation)) {
                state.particles.remove_at_unordered(particle_index);
            } else {
                particle_index++;
            }
        }
    }

    // Update projectiles
    {
        uint32_t projectile_index = 0;
        while (projectile_index < state.projectiles.size()) {
            Projectile& projectile = state.projectiles[projectile_index];
            if (projectile.position.distance_to(projectile.target) <= PROJECTILE_MOLOTOV_SPEED) {
                // On projectile finish
                if (projectile.type == PROJECTILE_MOLOTOV) {
                    match_set_cell_on_fire(state, projectile.target.to_ivec2() / TILE_SIZE, projectile.target.to_ivec2() / TILE_SIZE, projectile.source_player_id);
                    // Check that it's actually on fire before playing the sound
                    if (match_is_cell_on_fire(state, projectile.target.to_ivec2() / TILE_SIZE)) {
                    }
                }
                state.projectiles.remove_at_unordered(projectile_index);
            } else {
                projectile.position += ((projectile.target - projectile.position) * PROJECTILE_MOLOTOV_SPEED / projectile.position.distance_to(projectile.target));
                projectile_index++;
            }
        }
    }

    // Update fire
    {
        uint32_t fire_index = 0;
        while (fire_index < state.fires.size()) {
            animation_update(state.fires[fire_index].animation);

            // Start animation finished, enter prolonged burn and spread more flames
            if (state.fires[fire_index].animation.name == ANIMATION_FIRE_START && !animation_is_playing(state.fires[fire_index].animation)) {
                state.fires[fire_index].animation = animation_create(ANIMATION_FIRE_BURN);
                uint32_t fire_elevation = map_get_tile(state.map, state.fires[fire_index].cell).elevation;
                for (int direction = 0; direction < DIRECTION_COUNT; direction += 2) {
                    ivec2 child_cell = state.fires[fire_index].cell + DIRECTION_IVEC2[direction];
                    if (!map_is_cell_in_bounds(state.map, child_cell)) {
                        continue;
                    }
                    if (map_get_tile(state.map, child_cell).elevation != fire_elevation && !map_is_tile_ramp(state.map, child_cell)) {
                        continue;
                    }
                    match_set_cell_on_fire(state, child_cell, state.fires[fire_index].source_cell, state.fires[fire_index].source_player_id);
                }
            // Fire is in prolonged burn, count down time to live
            } else if (state.fires[fire_index].animation.name == ANIMATION_FIRE_BURN) {
                state.fires[fire_index].time_to_live--;
            }
            // Time to live is 0, extinguish fire
            if (state.fires[fire_index].time_to_live == 0) {
                state.fire_cells[(size_t)(state.fires[fire_index].cell.x + (state.fires[fire_index].cell.y * state.map.width))] = 0;
                state.fires.remove_at_unordered(fire_index);
            } else {
                fire_index++;
            }
        }
    }

    // Update fog reveals
    {
        uint32_t index = 0;
        while (index < state.fog_reveals.size()) {
            state.fog_reveals[index].timer--;
            if (state.fog_reveals[index].timer == 0) {
                match_fog_update(state, state.fog_reveals[index].team, state.fog_reveals[index].cell, state.fog_reveals[index].cell_size, state.fog_reveals[index].sight, false, CELL_LAYER_GROUND, false);
                state.fog_reveals.remove_at_unordered(index);
            } else {
                index++;
            }
        }
    }

    // Remove any dead entities
    {
        uint32_t entity_index = 0;
        while (entity_index < state.entities.size()) {
            if ((state.entities[entity_index].mode == MODE_UNIT_DEATH_FADE && !animation_is_playing(state.entities[entity_index].animation)) ||
                    (state.entities[entity_index].garrison_id != ID_NULL && state.entities[entity_index].health == 0) ||
                    (state.entities[entity_index].mode == MODE_BUILDING_DESTROYED && state.entities[entity_index].timer == 0)) {
                // Remove this entity's fog but only if they are not gold and not garrisoned
                if (state.entities[entity_index].player_id != PLAYER_NONE && state.entities[entity_index].garrison_id == ID_NULL) {
                    const EntityData& entity_data = entity_get_data(state.entities[entity_index].type);
                    // Decrementing non-detection fog only because entities should clear their detection when they begin death
                    match_fog_update(state, state.players[state.entities[entity_index].player_id].team, state.entities[entity_index].cell, entity_data.cell_size, entity_data.sight, false, entity_data.cell_layer, false);
                }
                // Remove this entity from garrisoned list if they are garrisoned
                if (state.entities[entity_index].garrison_id != ID_NULL) {
                    Entity& carrier = state.entities.get_by_id(state.entities[entity_index].garrison_id);
                    EntityId entity_id = state.entities.get_id_of(entity_index);
                    uint32_t garrison_index;
                    for (garrison_index = 0; garrison_index < carrier.garrisoned_units.size(); garrison_index++) {
                        if (carrier.garrisoned_units[garrison_index] == entity_id) {
                            break;
                        }
                    }
                    carrier.garrisoned_units.remove_at_ordered(garrison_index);
                    state.entities[entity_index].garrison_id = ID_NULL;
                }
                state.entities.remove_at(entity_index);
            } else {
                entity_index++;
            }
        }
    }

    // Update remembered entities
    for (uint8_t team = 0; team < MAX_PLAYERS; team++) {
        // Remove any remembered entities (but only if the players can see that they should be removed)
        uint8_t remembered_entity_index = 0;
        while (remembered_entity_index < state.remembered_entities[team].size()) {
            const RememberedEntity& remembered_entity = state.remembered_entities[team][remembered_entity_index];
            uint32_t entity_index = state.entities.get_index_of(remembered_entity.entity_id);
            if ((entity_index == INDEX_INVALID || state.entities[entity_index].health == 0) &&
                    match_is_cell_rect_revealed(state, team, remembered_entity.cell, entity_get_data(remembered_entity.type).cell_size)) {
                // Remove remembered entity
                state.remembered_entities[team].remove_at_unordered(remembered_entity_index);
            } else {
                remembered_entity_index++;
            }
        }
    }
}

// HELPERS

uint32_t match_get_player_population(const MatchState& state, uint8_t player_id) {
    uint32_t population = 0;
    for (uint32_t entity_index = 0; entity_index < state.entities.size(); entity_index++) {
        const Entity& entity = state.entities[entity_index];
        if (entity.player_id == player_id && entity_is_unit(entity.type) && entity.health != 0) {
            population += entity_get_data(entity.type).unit_data.population_cost;
        }
    }

    return population;
}

uint32_t match_get_player_max_population(const MatchState& state, uint8_t player_id) {
    uint32_t max_population = 0;
    for (uint32_t entity_index = 0; entity_index < state.entities.size(); entity_index++) {
        const Entity& entity = state.entities[entity_index];
        if (entity.player_id == player_id && (entity.type == ENTITY_HALL || entity.type == ENTITY_HOUSE) && entity.mode == MODE_BUILDING_FINISHED) {
            max_population += 10;
        }
    }

    return std::min(max_population, MATCH_MAX_POPULATION);
}

bool match_player_has_upgrade(const MatchState& state, uint8_t player_id, uint32_t upgrade) {
    return (state.players[player_id].upgrades & upgrade) == upgrade;
}

bool match_player_upgrade_is_available(const MatchState& state, uint8_t player_id, uint32_t upgrade) {
    return ((state.players[player_id].upgrades | state.players[player_id].upgrades_in_progress) & upgrade) == 0;
}

void match_grant_player_upgrade(MatchState& state, uint8_t player_id, uint32_t upgrade) {
    state.players[player_id].upgrades |= upgrade;

    // Grant detection to all detectives immediately, otherwise it will mess up the detection map
    if (upgrade == UPGRADE_PRIVATE_EYE) {
        const EntityData& entity_data = entity_get_data(ENTITY_DETECTIVE);
        for (uint32_t entity_index = 0; entity_index < state.entities.size(); entity_index++) {
            const Entity& entity = state.entities[entity_index];
            if (entity.player_id != player_id || entity.type != ENTITY_DETECTIVE || entity.health == 0) {
                continue;
            }

            // De-increment the detective's vision without detection
            match_fog_update(state, state.players[entity.player_id].team, entity.cell, entity_data.cell_size, entity_data.sight, false, entity_data.cell_layer, false);
            // Then re-increment it with detection
            match_fog_update(state, state.players[entity.player_id].team, entity.cell, entity_data.cell_size, entity_data.sight, true, entity_data.cell_layer, true);
        }
    }
}

uint32_t match_get_miners_on_gold(const MatchState& state, EntityId goldmine_id, uint8_t player_id) {
    uint32_t miner_count = 0;
    for (uint32_t entity_index = 0; entity_index < state.entities.size(); entity_index++) {
        const Entity& miner = state.entities[entity_index];
        if (miner.type == ENTITY_MINER && miner.player_id == player_id && miner.goldmine_id == goldmine_id) {
            miner_count++;
        }
    }
    return miner_count;
}

bool match_is_target_invalid(const MatchState& state, const Target& target, uint8_t player_id) {
    if (!(target.type == TARGET_ENTITY || target.type == TARGET_ATTACK_ENTITY || target.type == TARGET_REPAIR || target.type == TARGET_BUILD_ASSIST)) {
        return false;
    }

    uint32_t target_index = state.entities.get_index_of(target.id);
    if (target_index == INDEX_INVALID) {
        return true;
    }

    if (entity_is_misc(state.entities[target_index].type)) {
        return false;
    }

    if (target.type == TARGET_BUILD_ASSIST) {
        return state.entities[target_index].health == 0 || state.entities[target_index].target.type != TARGET_BUILD;
    }

    if (!entity_is_selectable(state.entities[target_index])) {
        return true;
    }

    if (target.type == TARGET_ATTACK_ENTITY &&
            entity_check_flag(state.entities[target_index], ENTITY_FLAG_INVISIBLE) &&
            !entity_is_visible_to_player(state, state.entities[target_index], player_id)) {
        return true;
    }

    return false;
}

bool match_player_has_buildings(const MatchState& state, uint8_t player_id) {
    for (uint32_t entity_index = 0; entity_index < state.entities.size(); entity_index++) {
        const Entity& entity = state.entities[entity_index];
        if (entity.player_id == player_id &&
                entity_is_building(entity.type) &&
                entity.type != ENTITY_LANDMINE &&
                entity.mode != MODE_BUILDING_DESTROYED) {
            return true;
        }
    }

    return false;
}

bool match_player_has_entities(const MatchState& state, uint8_t player_id) {
    for (uint32_t entity_index = 0; entity_index < state.entities.size(); entity_index++) {
        const Entity& entity = state.entities[entity_index];
        if (entity.player_id == player_id &&
                entity.type != ENTITY_LANDMINE &&
                entity.health != 0) {
            return true;
        }
    }

    return false;
}

uint32_t match_team_find_remembered_entity_index(const MatchState& state, uint8_t team, EntityId entity_id) {
    for (uint32_t index = 0; index < state.remembered_entities[team].size(); index++) {
        if (state.remembered_entities[team][index].entity_id == entity_id) {
            return index;
        }
    }

    return MATCH_ENTITY_NOT_REMEMBERED;
}

bool match_team_remembers_entity(const MatchState& state, uint8_t team, EntityId entity_id) {
    for (uint32_t index = 0; index < state.remembered_entities[team].size(); index++) {
        if (state.remembered_entities[team][index].entity_id == entity_id) {
            return true;
        }
    }

    return false;
}

bool match_player_has_at_least_one_active_opponent(const MatchState& state, uint8_t player_id) {
    for (uint8_t other_player_id = 0; other_player_id < MAX_PLAYERS; other_player_id++) {
        if (state.players[other_player_id].team != state.players[player_id].team &&
                state.players[other_player_id].mode == PLAYER_MODE_ACTIVE) {
            return true;
        }
    }
    return false;
}


// FIND ENTITY

EntityId match_find_entity(const MatchState& state, std::function<bool(const Entity& entity, EntityId entity_id)> filter) {
    for (uint32_t entity_index = 0; entity_index < state.entities.size(); entity_index++) {
        const Entity& entity = state.entities[entity_index];
        EntityId entity_id = state.entities.get_id_of(entity_index);
        if (filter(entity, entity_id)) {
            return entity_id;
        }
    }

    return ID_NULL;
}

EntityId match_find_best_entity(const MatchState& state, const MatchFindBestEntityParams& params) {
    uint32_t best_entity_index = INDEX_INVALID;
    for (uint32_t entity_index = 0; entity_index < state.entities.size(); entity_index++) {
        const Entity& entity = state.entities[entity_index];
        EntityId entity_id = state.entities.get_id_of(entity_index);

        if (!params.filter(entity, entity_id)) {
            continue;
        }
        if (best_entity_index == INDEX_INVALID || params.compare(entity, state.entities[best_entity_index])) {
            best_entity_index = entity_index;
        }
    }

    if (best_entity_index == INDEX_INVALID) {
        return ID_NULL;
    }

    return state.entities.get_id_of(best_entity_index);
}

std::function<bool(const Entity& a, const Entity& b)> match_compare_closest_manhattan_distance_to(ivec2 cell) {
    return [cell](const Entity& a, const Entity& b) {
        return ivec2::manhattan_distance(a.cell, cell) < ivec2::manhattan_distance(b.cell, cell);
    };
}

EntityList match_find_entities(const MatchState& state, std::function<bool(const Entity& entity, EntityId entity_id)> filter) {
    EntityList entity_list;

    for (uint32_t entity_index = 0; entity_index < state.entities.size(); entity_index++) {
        const Entity& entity = state.entities[entity_index];
        EntityId entity_id = state.entities.get_id_of(entity_index);

        if (!filter(entity, entity_id)) {
            continue;
        }
        if (entity_list.is_full()) {
            break;
        }
        entity_list.push_back(entity_id);
    }

    return entity_list;
}

EntityId match_get_nearest_builder(const MatchState& state, const std::vector<EntityId>& builders, ivec2 cell) {
    EntityId nearest_unit_id;
    int nearest_unit_dist = -1;
    for (EntityId id : builders) {
        int selection_dist = ivec2::manhattan_distance(cell, state.entities.get_by_id(id).cell);
        if (nearest_unit_dist == -1 || selection_dist < nearest_unit_dist) {
            nearest_unit_id = id;
            nearest_unit_dist = selection_dist;
        }
    }

    return nearest_unit_id;
}

// FOG

int match_get_fog(const MatchState& state, uint8_t team, ivec2 cell) {
    return state.fog[team][cell.x + (cell.y * state.map.width)];
}

bool match_is_cell_rect_revealed(const MatchState& state, uint8_t team, ivec2 cell, int cell_size) {
    for (int y = cell.y; y < cell.y + cell_size; y++) {
        for (int x = cell.x; x < cell.x + cell_size; x++) {
            if (state.fog[team][x + (y * state.map.width)] > 0) {
                return true;
            }
        }
    }

    return false;
}

bool match_is_cell_rect_explored(const MatchState& state, uint8_t team, ivec2 cell, int cell_size) {
    for (int y = cell.y; y < cell.y + cell_size; y++) {
        for (int x = cell.x; x < cell.x + cell_size; x++) {
            if (state.fog[team][x + (y * state.map.width)] != FOG_HIDDEN) {
                return true;
            }
        }
    }

    return false;
}

void match_fog_update(MatchState& state, uint8_t team, ivec2 cell, int cell_size, int sight, bool has_detection, CellLayer cell_layer, bool increment) {
    /*
    * This function does a raytrace from the cell center outwards to determine what this unit can see
    * Raytracing is done using Bresenham's Line Generation Algorithm (https://www.geeksforgeeks.org/bresenhams-line-generation-algorithm/)
    */

    ivec2 search_corners[4] = {
        cell - ivec2(sight, sight),
        cell + ivec2((cell_size - 1) + sight, -sight),
        cell + ivec2((cell_size - 1) + sight, (cell_size - 1) + sight),
        cell + ivec2(-sight, (cell_size - 1) + sight)
    };
    for (int search_index = 0; search_index < 4; search_index++) {
        ivec2 search_goal = search_corners[search_index + 1 == 4 ? 0 : search_index + 1];
        ivec2 search_step = DIRECTION_IVEC2[(search_index * 2) + 2 == DIRECTION_COUNT
                                            ? DIRECTION_NORTH
                                            : (search_index * 2) + 2];
        for (ivec2 line_end = search_corners[search_index]; line_end != search_goal; line_end += search_step) {
            ivec2 line_start;
            switch (cell_size) {
                case 1:
                    line_start = cell;
                    break;
                case 3:
                    line_start = cell + ivec2(1, 1);
                    break;
                case 2:
                case 4: {
                    ivec2 center_cell = cell_size == 2 ? cell : cell + ivec2(1, 1);
                    if (line_end.x < center_cell.x) {
                        line_start.x = center_cell.x;
                    } else if (line_end.x > center_cell.x + 1) {
                        line_start.x = center_cell.x + 1;
                    } else {
                        line_start.x = line_end.x;
                    }
                    if (line_end.y < center_cell.y) {
                        line_start.y = center_cell.y;
                    } else if (line_end.y > center_cell.y + 1) {
                        line_start.y = center_cell.y + 1;
                    } else {
                        line_start.y = line_end.y;
                    }
                    break;
                }
                default:
                    line_start = cell;
                    break;
            }

            // we want slope to be between 0 and 1
            // if "run" is greater than "rise" then m is naturally between 0 and 1, we will step with x in increments of 1 and handle y increments that are less than 1
            // if "rise" is greater than "run" (use_x_step is false) then we will swap x and y so that we can step with y in increments of 1 and handle x increments that are less than 1
            bool use_x_step = std::abs(line_end.x - line_start.x) >= std::abs(line_end.y - line_start.y);
            int slope = std::abs(2 * (use_x_step ? (line_end.y - line_start.y) : (line_end.x - line_start.x)));
            int slope_error = slope - std::abs((use_x_step ? (line_end.x - line_start.x) : (line_end.y - line_start.y)));
            ivec2 line_step;
            ivec2 line_opposite_step;
            if (use_x_step) {
                line_step = ivec2(1, 0) * (line_end.x >= line_start.x ? 1 : -1);
                line_opposite_step = ivec2(0, 1) * (line_end.y >= line_start.y ? 1 : -1);
            } else {
                line_step = ivec2(0, 1) * (line_end.y >= line_start.y ? 1 : -1);
                line_opposite_step = ivec2(1, 0) * (line_end.x >= line_start.x ? 1 : -1);
            }
            for (ivec2 line_cell = line_start; line_cell != line_end; line_cell += line_step) {
                if (!map_is_cell_in_bounds(state.map, line_cell) || ivec2::euclidean_distance_squared(line_start, line_cell) > sight * sight) {
                    break;
                }

                if (increment) {
                    if (state.fog[team][line_cell.x + (line_cell.y * state.map.width)] == FOG_HIDDEN) {
                        state.fog[team][line_cell.x + (line_cell.y * state.map.width)] = 1;
                    } else {
                        state.fog[team][line_cell.x + (line_cell.y * state.map.width)]++;
                    }
                    if (has_detection) {
                        state.detection[team][line_cell.x + (line_cell.y * state.map.width)]++;
                    }
                } else {
                    state.fog[team][line_cell.x + (line_cell.y * state.map.width)]--;
                    if (has_detection) {
                        state.detection[team][line_cell.x + (line_cell.y * state.map.width)]--;
                    }

                    // Remember revealed entities
                    Cell map_cell = map_get_cell(state.map, CELL_LAYER_GROUND, line_cell);
                    // landmines are not shown in remembered entities so don't add them to this list, maybe
                    if (map_cell.type == CELL_BUILDING || map_cell.type == CELL_GOLDMINE) {
                        Entity& entity = state.entities.get_by_id(map_cell.id);
                        if (entity_is_selectable(entity) && entity.type != ENTITY_LANDMINE) {
                            ivec2 frame = entity_get_animation_frame(entity);

                            // When remembering goldmines, remember them as empty, not full
                            if (entity.type == ENTITY_GOLDMINE && frame.x == 1) {
                                frame.x = 0;
                            }

                            RememberedEntity remembered_entity = (RememberedEntity) {
                                .entity_id = map_cell.id,
                                .recolor_id = entity.mode == MODE_BUILDING_DESTROYED || entity_is_misc(entity.type)
                                    ? (uint16_t)0U
                                    : (uint16_t)state.players[entity.player_id].recolor_id,
                                .type = entity.type,
                                .frame = frame,
                                .cell = entity.cell
                            };

                            uint32_t remembered_entity_index = match_team_find_remembered_entity_index(state, team, map_cell.id);
                            if (remembered_entity_index == MATCH_ENTITY_NOT_REMEMBERED) {
                                state.remembered_entities[team].push_back(remembered_entity);
                            } else {
                                state.remembered_entities[team][remembered_entity_index] = remembered_entity;
                            }
                        }
                    } // End if cell value < cell empty
                } // End if !increment

                if (map_get_tile(state.map, line_cell).elevation > map_get_tile(state.map, line_start).elevation && cell_layer != CELL_LAYER_SKY) {
                    break;
                }

                slope_error += slope;
                if (slope_error >= 0) {
                    line_cell += line_opposite_step;
                    slope_error -= 2 * std::abs((use_x_step ? (line_end.x - line_start.x) : (line_end.y - line_start.y)));
                }
            } // End for each line cell in line
        } // End for each line end from corner to corner
    } // End for each search index
}

// FIRE

bool match_is_cell_on_fire(const MatchState& state, ivec2 cell) {
    return state.fire_cells[cell.x + (cell.y * state.map.width)] == 1;
}

bool match_is_cell_rect_on_fire(const MatchState& state, ivec2 cell, int cell_size) {
    for (int y = cell.y; y < cell.y + cell_size; y++) {
        for (int x = cell.x; x < cell.x + cell_size; x++) {
            if (state.fire_cells[x + (y * state.map.width)] == 1) {
                return true;
            }
        }
    }

    return false;
}

void match_set_cell_on_fire(MatchState& state, ivec2 cell, ivec2 source_cell, uint32_t source_player_id) {
    if (match_is_cell_on_fire(state, cell)) {
        return;
    }
    if (map_get_cell(state.map, CELL_LAYER_GROUND, cell).type == CELL_BLOCKED) {
        return;
    }
    if (map_is_tile_water(state.map, cell)) {
        return;
    }
    if (ivec2::manhattan_distance(cell, source_cell) > PROJECTILE_MOLOTOV_FIRE_SPREAD ||
        (cell.x == source_cell.x && std::abs(cell.y - source_cell.y) >= PROJECTILE_MOLOTOV_FIRE_SPREAD) ||
        (cell.y == source_cell.y && std::abs(cell.x - source_cell.x) >= PROJECTILE_MOLOTOV_FIRE_SPREAD)) {
        return;
    }
    state.fires.push_back((Fire) {
        .cell = cell,
        .source_cell = source_cell,
        .source_player_id = source_player_id,
        .time_to_live = FIRE_TTL,
        .animation = animation_create(ANIMATION_FIRE_START)
    });
    state.fire_cells[cell.x + (cell.y * state.map.width)] = 1;
}
