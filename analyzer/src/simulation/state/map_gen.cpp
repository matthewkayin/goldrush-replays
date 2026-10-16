#include "map_gen.h"

#include "simulation/defines.h"
#include "simulation/util/math.h"
#include "simulation/render/sprite.h"
#include "simulation/shared/match_setting.h"
#include "simulation/util/lcg.h"
#include "simulation/util/bitflag.h"
#include "simulation/util/simplex_noise.h"
#include <algorithm>
#include <queue>
#include <stdexcept> // ANALYZER: bounds check for untrusted replay data
#include <cstring> // ANALYZER: memset/memcpy were only declared through transitive includes

// This is a soft spawn size that biases map generation and also guarantees distance between goldmines
static const int PLAYER_SPAWN_SIZE = 24;
// This is a guaranteed hard spawn size, all goldmines will have this much radius of flatground around them
static const int PLAYER_SPAWN_HARD_SIZE = 16;
static const int PLAYER_SPAWN_MARGIN = 4;
static const uint32_t ISLAND_UNASSIGNED = UINT32_MAX;
static const int GOLDMINE_SIZE = 3;
static const int HALL_SIZE = 4;

static const uint8_t TILE_TYPE_LOWGROUND = 0;
static const uint8_t TILE_TYPE_HIGHGROUND = 1;
static const uint8_t TILE_TYPE_FRONT_WALL = 2;

static const uint32_t VALID_2X2_MASKS[4] = {
    1 + 2 + 4,
    4 + 8 + 16,
    16 + 32 + 64,
    64 + 128 + 1
};

// RAW MAP

void raw_map_init(RawMap* raw_map, int width, int height) {
    raw_map->width = width;
    raw_map->height = height;
    memset(raw_map->data, MAP_VALUE_LOWGROUND, raw_map->width * raw_map->height * sizeof(uint8_t));
}

void raw_map_generate(RawMap* raw_map, MapType map_type, int map_width, int map_height, int lcg_seed, uint32_t options) {
    // Allocate map
    raw_map_init(raw_map, map_width, map_height);

    // Generate goldmines
    const std::vector<ivec2> goldmines = map_generate_goldmines(map_width, map_height, &lcg_seed);

    // Generate terrain
    raw_map_generate_terrain(raw_map, goldmines, &lcg_seed);

    // Invert map if requested
    if (bitflag_check(options, MAP_GEN_OPTION_INVERT_MAP)) {
        for (int index = 0; index < raw_map->width * raw_map->height; index++) {
            raw_map->data[index] = raw_map->data[index] == MAP_VALUE_HIGHGROUND
                ? MAP_VALUE_LOWGROUND
                : MAP_VALUE_HIGHGROUND;
        }
    }

    raw_map_remove_narrow_canyons(raw_map);
    raw_map_smooth_with_cellular_automata(raw_map, 40);
    raw_map_remove_narrow_bridges(raw_map);
    raw_map_remove_artifacts(raw_map);
    raw_map_remove_lowground_nooks(raw_map);
    raw_map_remove_small_lowground(raw_map);
    raw_map_remove_ugly_front_walls(raw_map);
    raw_map_generate_water(raw_map, goldmines, &lcg_seed);
    raw_map_generate_stairs(raw_map);

    // Save goldmines into raw map
    if (bitflag_check(options, MAP_GEN_OPTION_SAVE_GOLDMINES)) {
        raw_map_save_goldmines(raw_map, goldmines);
    }

    // Generate decorations
    if (bitflag_check(options, MAP_GEN_OPTION_GENERATE_DECORATIONS)) {
        raw_map_generate_decorations(raw_map, map_type, &lcg_seed);
    }
}

bool raw_map_is_cell_in_bounds(const RawMap* raw_map, ivec2 cell) {
    return !(cell.x < 0 || cell.y < 0 || cell.x >= raw_map->width || cell.y >= raw_map->height);
}

bool raw_map_is_cell_rect_in_bounds(const RawMap* raw_map, ivec2 cell, int cell_size) {
    return !(cell.x < 0 || cell.y < 0 || cell.x + cell_size > raw_map->width || cell.y + cell_size > raw_map->height);
}

void raw_map_generate_terrain(RawMap* raw_map, const std::vector<ivec2>& goldmines, int* lcg_seed) {
    // Decide whether the area surrounding each goldmine is on highground or lowground
    std::vector<uint8_t> goldmine_map_value(goldmines.size());
    for (uint32_t goldmine_index = 0; goldmine_index < goldmines.size(); goldmine_index++) {
        uint8_t map_value = goldmine_index < MAX_PLAYERS || lcg_rand(lcg_seed) % 2 == 0
            ? MAP_VALUE_HIGHGROUND
            : MAP_VALUE_LOWGROUND;
        goldmine_map_value[goldmine_index] = map_value;
    }

    const double LARGE_FREQUENCY = 1.0 / 128.0;
    const double DETAIL_FREQUENCY = 1.0 / 48.0;
    const double BASE_THRESHOLD = 0.65;
    const double THRESHOLD_AMPLITUDE = 0.3;
    for (int y = 0; y < raw_map->height; y++) {
        for (int x = 0; x < raw_map->width; x++) {
            ivec2 cell = ivec2(x, y);

            // Check if this cell is within the radius of a goldmine
            uint32_t nearby_goldmine_index;
            for (nearby_goldmine_index = 0; nearby_goldmine_index < goldmines.size(); nearby_goldmine_index++) {
                if (ivec2::euclidean_distance_squared(cell, goldmines[nearby_goldmine_index]) < PLAYER_SPAWN_SIZE * PLAYER_SPAWN_SIZE) {
                    break;
                }
            }

            // If it's within the radius and close to the goldmine location, then just use the goldmine map value
            if (nearby_goldmine_index < goldmines.size()) {
                ivec2 goldmine_cell = raw_map_get_goldmine_position(raw_map, goldmines, nearby_goldmine_index);
                if (ivec2::euclidean_distance_squared(ivec2(x, y), goldmine_cell) < PLAYER_SPAWN_HARD_SIZE * PLAYER_SPAWN_HARD_SIZE) {
                    raw_map->data[x + (y * raw_map->width)] = goldmine_map_value[nearby_goldmine_index];
                    continue;
                }
            }

            // Generate a noise value and threshold
            double large_value = (simplex_noise((uint64_t)*lcg_seed, x * LARGE_FREQUENCY, y * LARGE_FREQUENCY) + 1.0) * 0.5;
            double detail_value = (simplex_noise((uint64_t)*lcg_seed, x * DETAIL_FREQUENCY, y * DETAIL_FREQUENCY) + 1.0) * 0.5;
            double threshold = BASE_THRESHOLD + (large_value - 0.5) * THRESHOLD_AMPLITUDE * 2.0;
            threshold = std::clamp(threshold, 0.2, 0.8);


            // If it is, modify the threshold to prefer the goldmine's terrain
            if (nearby_goldmine_index < goldmines.size()) {
                double percent_nearness_to_goldmine = 1.0 - ((double)ivec2::euclidean_distance_squared(ivec2(x, y), goldmines[nearby_goldmine_index]) / (double)(PLAYER_SPAWN_SIZE * PLAYER_SPAWN_SIZE));
                double threshold_modifier_direction = goldmine_map_value[nearby_goldmine_index] == MAP_VALUE_LOWGROUND ? 1.0 : -1.0;
                threshold += 1.0 * percent_nearness_to_goldmine * threshold_modifier_direction;
            }

            // Choose the terrain
            raw_map->data[x + (y * raw_map->width)] = detail_value < threshold
                ? MAP_VALUE_LOWGROUND
                : MAP_VALUE_HIGHGROUND;
        }
    }
}

void raw_map_smooth_with_cellular_automata(RawMap* raw_map, uint32_t iterations) {
    std::vector<uint8_t> previous_map_data(raw_map->width * raw_map->height);

    for (uint32_t iteration = 0; iteration < iterations; iteration++) {
        memcpy(&previous_map_data[0], raw_map->data, raw_map->width * raw_map->height * sizeof(uint8_t));

        for (int y = 0; y < raw_map->height; y++) {
            for (int x = 0; x < raw_map->width; x++) {
                uint32_t neighbor_count = 0;
                if (previous_map_data[x + (y * raw_map->width)] == MAP_VALUE_LOWGROUND) {
                    neighbor_count++;
                }
                for (int direction = 0; direction < DIRECTION_COUNT; direction++) {
                    ivec2 neighbor_cell = ivec2(x, y) + DIRECTION_IVEC2[direction];
                    if (!raw_map_is_cell_in_bounds(raw_map, neighbor_cell)) {
                        continue;
                    }
                    if (previous_map_data[neighbor_cell.x + (neighbor_cell.y * raw_map->width)] == MAP_VALUE_LOWGROUND) {
                        neighbor_count++;
                    }
                }

                raw_map->data[x + (y * raw_map->width)] = neighbor_count < 5
                    ? MAP_VALUE_LOWGROUND
                    : MAP_VALUE_HIGHGROUND;
            }
        }
    }
}

RawMapIslandInfo raw_map_get_island_info(const RawMap* raw_map) {
    RawMapIslandInfo island_info;
    island_info.island_of = std::vector<uint32_t>(raw_map->width * raw_map->height, ISLAND_UNASSIGNED);

    std::vector<bool> explored(raw_map->width * raw_map->height, false);
    for (int index = 0; index < raw_map->width * raw_map->height; index++) {
        if (island_info.island_of[index] != ISLAND_UNASSIGNED) {
            continue;
        }

        std::fill(explored.begin(), explored.end(), false);
        std::queue<ivec2> frontier;
        frontier.push(ivec2(index % raw_map->width, index / raw_map->width));

        ivec2 island_min = ivec2(index % raw_map->width, index / raw_map->width);
        ivec2 island_max = island_min;
        uint32_t next_island = island_info.island_bounding_rects.size();

        while (!frontier.empty()) {
            ivec2 next = frontier.front();
            frontier.pop();

            if (explored[next.x + (next.y * raw_map->width)]) {
                continue;
            }

            uint32_t next_map_index = next.x + (next.y * raw_map->width);
            if (island_info.island_of[next_map_index] != ISLAND_UNASSIGNED ||
                    raw_map->data[next_map_index] != raw_map->data[index]) {
                continue;
            }

            island_info.island_of[next_map_index] = next_island;
            explored[next_map_index] = true;

            island_min.x = std::min(next.x, island_min.x);
            island_min.y = std::min(next.y, island_min.y);
            island_max.x = std::max(next.x, island_max.x);
            island_max.y = std::max(next.y, island_max.y);

            for (int direction = 0; direction < DIRECTION_COUNT; direction += 2) {
                ivec2 child = next + DIRECTION_IVEC2[direction];
                if (!raw_map_is_cell_in_bounds(raw_map, child)) {
                    continue;
                }

                frontier.push(child);
            }
        }

        island_info.island_bounding_rects.push_back((Rect) {
            .x = island_min.x,
            .y = island_min.y,
            .w = (island_max.x - island_min.x) + 1,
            .h = (island_max.y - island_min.y) + 1
        });
        island_info.island_map_value.push_back(raw_map->data[index]);
    }

    return island_info;
}

std::vector<uint8_t> raw_map_get_tile_types(const RawMap* raw_map) {
    std::vector<uint8_t> tile_type(raw_map->width * raw_map->height, TILE_TYPE_LOWGROUND);
    for (int y = 0; y < raw_map->height; y++) {
        for (int x = 0; x < raw_map->width; x++) {
            if (raw_map->data[x + (y * raw_map->width)] != MAP_VALUE_HIGHGROUND) {
                continue;
            }

            tile_type[x + (y * raw_map->width)] = TILE_TYPE_HIGHGROUND;
            if (y == raw_map->height - 1) {
                continue;
            }
            Tile tile = raw_map_get_baked_tile_at_cell(raw_map, MAP_TYPE_BOULDER, ivec2(x, y));
            if (map_tile_is_south_wall((SpriteName)tile.sprite)) {
                tile_type[x + ((y + 1) * raw_map->width)] = TILE_TYPE_FRONT_WALL;
            }
        }
    }

    return tile_type;
}

void raw_map_remove_narrow_canyons(RawMap* raw_map) {
    const RawMapIslandInfo island_info = raw_map_get_island_info(raw_map);

    const int CANYON_CIRCLE_RADIUS = 4U;
    for (int index = 0; index < raw_map->width * raw_map->height; index++) {
        if (raw_map->data[index] != MAP_VALUE_LOWGROUND) {
            continue;
        }

        ivec2 cell = ivec2(index % raw_map->width, index / raw_map->width);

        uint32_t neighboring_highground_island = ISLAND_UNASSIGNED;
        bool cell_has_two_neighboring_highground_islands = false;
        for (int ny = cell.y - CANYON_CIRCLE_RADIUS; ny <= cell.y + CANYON_CIRCLE_RADIUS; ny++) {
            for (int nx = cell.x - CANYON_CIRCLE_RADIUS; nx <= cell.x + CANYON_CIRCLE_RADIUS; nx++) {
                ivec2 neighbor_cell = ivec2(nx, ny);
                uint32_t neighbor_index = neighbor_cell.x + (neighbor_cell.y * raw_map->width);

                if (!raw_map_is_cell_in_bounds(raw_map, neighbor_cell)) {
                    continue;
                }
                if (ivec2::euclidean_distance_squared(cell, neighbor_cell) > CANYON_CIRCLE_RADIUS * CANYON_CIRCLE_RADIUS) {
                    continue;
                }
                if (raw_map->data[neighbor_index] != MAP_VALUE_HIGHGROUND) {
                    continue;
                }

                if (neighboring_highground_island != ISLAND_UNASSIGNED && island_info.island_of[neighbor_index] != neighboring_highground_island) {
                    cell_has_two_neighboring_highground_islands = true;
                }
                neighboring_highground_island = island_info.island_of[neighbor_index];
            }
        }

        if (!cell_has_two_neighboring_highground_islands) {
            continue;
        }

        for (int ny = cell.y - CANYON_CIRCLE_RADIUS; ny <= cell.y + CANYON_CIRCLE_RADIUS; ny++) {
            for (int nx = cell.x - CANYON_CIRCLE_RADIUS; nx <= cell.x + CANYON_CIRCLE_RADIUS; nx++) {
                ivec2 neighbor_cell = ivec2(nx, ny);
                uint32_t neighbor_index = neighbor_cell.x + (neighbor_cell.y * raw_map->width);

                if (!raw_map_is_cell_in_bounds(raw_map, neighbor_cell)) {
                    continue;
                }
                if (ivec2::euclidean_distance_squared(cell, neighbor_cell) > CANYON_CIRCLE_RADIUS * CANYON_CIRCLE_RADIUS) {
                    continue;
                }
                if (island_info.island_of[neighbor_index] != island_info.island_of[index]) {
                    continue;
                }

                raw_map->data[neighbor_index] = MAP_VALUE_HIGHGROUND;
            }
        }
    }
}

void raw_map_remove_small_lowground(RawMap* raw_map) {
    const RawMapIslandInfo island_info = raw_map_get_island_info(raw_map);

    for (uint32_t island_index = 0; island_index < island_info.island_map_value.size(); island_index++) {
        const Rect& island_bounding_rect = island_info.island_bounding_rects[island_index];
        if (island_info.island_map_value[island_index] != MAP_VALUE_LOWGROUND) {
            continue;
        }
        if (island_bounding_rect.w >= 6 && island_bounding_rect.h >= 6) {
            continue;
        }

        const Rect& rect = island_info.island_bounding_rects[island_index];
        for (int y = rect.y; y < rect.y + rect.h; y++) {
            for (int x = rect.x; x < rect.x + rect.w; x++) {
                if (island_info.island_of[x + (y * raw_map->width)] == island_index) {
                    raw_map->data[x + (y * raw_map->width)] = MAP_VALUE_HIGHGROUND;
                }
            }
        }
    }
}

void raw_map_remove_lowground_nooks(RawMap* raw_map) {
    // Determine which tiles are highground walls and floors
    std::vector<uint8_t> tile_type = raw_map_get_tile_types(raw_map);

    // Remove the lowground nooks (areas that a 2x2 unit cannot stand in)
    for (int y = 0; y < raw_map->height; y++) {
        for (int x = 0; x < raw_map->width; x++) {
            if (tile_type[x + (y * raw_map->width)] != TILE_TYPE_LOWGROUND) {
                continue;
            }

            uint32_t lowground_neighbors = 0;
            for (int direction = 0; direction < DIRECTION_COUNT; direction++) {
                ivec2 neighbor = ivec2(x, y) + DIRECTION_IVEC2[direction];
                if (!raw_map_is_cell_in_bounds(raw_map, neighbor)) {
                    continue;
                }

                if (tile_type[neighbor.x + (neighbor.y * raw_map->width)] == TILE_TYPE_LOWGROUND) {
                    lowground_neighbors |= DIRECTION_MASK[direction];
                }
            }

            bool are_neighbors_valid = false;
            for (int index = 0; index < 4; index++) {
                if ((lowground_neighbors & VALID_2X2_MASKS[index]) == VALID_2X2_MASKS[index]) {
                    are_neighbors_valid = true;
                    break;
                }
            }
            if (are_neighbors_valid) {
                continue;
            }

            if (y > 0 && tile_type[x + ((y - 1) * raw_map->width)] == TILE_TYPE_FRONT_WALL) {
                raw_map->data[x + ((y - 1) * raw_map->width)] = MAP_VALUE_HIGHGROUND;
            } else {
                raw_map->data[x + (y * raw_map->width)] = MAP_VALUE_HIGHGROUND;
            }
        }
    }
}

void raw_map_remove_ugly_front_walls(RawMap* raw_map) {
    std::vector<uint8_t> tile_type = raw_map_get_tile_types(raw_map);

    for (int y = 0; y < raw_map->height - 1; y++) {
        for (int x = 0; x < raw_map->width; x++) {
            if (tile_type[x + (y * raw_map->width)] == TILE_TYPE_FRONT_WALL &&
                    tile_type[x + ((y + 1) * raw_map->width)] == TILE_TYPE_HIGHGROUND) {
                raw_map->data[x + (y * raw_map->width)] = MAP_VALUE_HIGHGROUND;
            }
        }
    }
}

void raw_map_remove_narrow_bridges(RawMap* raw_map) {
    const uint8_t NARROW_BRIDGES_TILE_TYPE_LOWGROUND = 0;
    const uint8_t NARROW_BRIDGES_TILE_TYPE_HIGHGROUND_WALL = 1;
    const uint8_t NARROW_BRIDGES_TILE_TYPE_HIGHGROUND_FLOOR = 2;
    const uint8_t NARROW_BRIDGES_TILE_TYPE_HIGHGROUND_2X2_FLOOR = 3;

    // Determine the initial tile type of each cell
    std::vector<uint8_t> tile_type(raw_map->width * raw_map->height, NARROW_BRIDGES_TILE_TYPE_LOWGROUND);
    for (int y = 0; y < raw_map->height; y++) {
        for (int x = 0; x < raw_map->width; x++) {
            int index = x + (y * raw_map->width);
            if (raw_map->data[index] != MAP_VALUE_HIGHGROUND) {
                continue;
            }

            uint32_t lowground_neighbor_count = 0;
            for (int direction = 0; direction < DIRECTION_COUNT; direction++) {
                ivec2 neighbor_cell = ivec2(x, y) + DIRECTION_IVEC2[direction];
                if (!raw_map_is_cell_in_bounds(raw_map, neighbor_cell)) {
                    continue;
                }
                if (raw_map->data[neighbor_cell.x + (neighbor_cell.y * raw_map->width)] != MAP_VALUE_HIGHGROUND) {
                    lowground_neighbor_count++;
                }
            }

            tile_type[index] = lowground_neighbor_count != 0
                ? NARROW_BRIDGES_TILE_TYPE_HIGHGROUND_WALL
                : NARROW_BRIDGES_TILE_TYPE_HIGHGROUND_FLOOR;
        }
    }

    // Then determine which of the highground floors can fix a 2x2 unit
    for (int y = 0; y < raw_map->height - 1; y++) {
        for (int x = 0; x < raw_map->width - 1; x++) {
            const int indices[4] = {
                x + (y * raw_map->width),
                (x + 1) + (y * raw_map->width),
                (x + 1) + ((y + 1) * raw_map->width),
                x + ((y + 1) * raw_map->width)
            };
            bool are_all_highground_floor = true;
            for (int index = 0; index < 4; index++) {
                are_all_highground_floor &=
                    tile_type[indices[index]] == NARROW_BRIDGES_TILE_TYPE_HIGHGROUND_FLOOR ||
                    tile_type[indices[index]] == NARROW_BRIDGES_TILE_TYPE_HIGHGROUND_2X2_FLOOR;
            }
            if (!are_all_highground_floor) {
                continue;
            }

            for (int index = 0; index < 4; index++) {
                tile_type[indices[index]] = NARROW_BRIDGES_TILE_TYPE_HIGHGROUND_2X2_FLOOR;
            }
        }
    }

    // Finally, widen the 1x1 highground floors
    for (int index = 0; index < raw_map->width * raw_map->height; index++) {
        // Filter down to just 1x1 highground floors
        if (tile_type[index] != NARROW_BRIDGES_TILE_TYPE_HIGHGROUND_FLOOR) {
            continue;
        }

        // Not all 1x1 floors will be narrow bridges
        // To determine if it's a bridge, we have to count the adjacent cells
        // If we have 2 walls and 2 highground floors (in other words, an equal number of adjacent walls and floors)
        // then that means this is a thin bridge and should be expanded
        uint32_t adjacent_wall_count = 0;
        uint32_t adjacent_floor_count = 0;
        ivec2 cell = ivec2(index % raw_map->width, index / raw_map->width);
        for (int direction = 0; direction < DIRECTION_COUNT; direction += 2) {
            ivec2 neighbor = cell + DIRECTION_IVEC2[direction];
            if (!raw_map_is_cell_in_bounds(raw_map, neighbor)) {
                continue;
            }

            uint8_t neighbor_tile_type = tile_type[neighbor.x + (neighbor.y * raw_map->width)];
            if (neighbor_tile_type == NARROW_BRIDGES_TILE_TYPE_HIGHGROUND_WALL) {
                adjacent_wall_count++;
            } else {
                adjacent_floor_count++;
            }
        }

        // We have determined that this is a thin bridge, expand it
        if (adjacent_wall_count == adjacent_floor_count) {
            const int BRIDGE_EXPANSION_RADIUS = 4U;
            for (int y = std::max(cell.y - BRIDGE_EXPANSION_RADIUS, 0); y <= std::min(cell.y + BRIDGE_EXPANSION_RADIUS, raw_map->height - 1); y++) {
                for (int x = std::max(cell.x - BRIDGE_EXPANSION_RADIUS, 0); x <= std::min(cell.x + BRIDGE_EXPANSION_RADIUS, raw_map->width - 1); x++) {
                    if (ivec2::euclidean_distance_squared(cell, ivec2(x, y)) > BRIDGE_EXPANSION_RADIUS * BRIDGE_EXPANSION_RADIUS) {
                        continue;
                    }
                    raw_map->data[x + (y * raw_map->width)] = MAP_VALUE_HIGHGROUND;
                }
            }
        }
    }
}

bool raw_map_remove_artifacts(RawMap* raw_map) {
    bool removed_artifacts = false;
    std::vector<ivec2> artifacts;
    do {
        for (ivec2 artifact : artifacts) {
            raw_map->data[artifact.x + (artifact.y * raw_map->width)] = MAP_VALUE_LOWGROUND;
        }
        removed_artifacts |= !artifacts.empty();
        artifacts.clear();

        for (int index = 0; index < raw_map->width * raw_map->height; index++) {
            ivec2 cell = ivec2(index % raw_map->width, index / raw_map->width);
            // Passing in tombstone as map type, but any map type will do here since we're not keeping the value
            Tile tile = raw_map_get_baked_tile_at_cell(raw_map, MAP_TYPE_TOMBSTONE, cell);
            if (tile.sprite == SPRITE_TILE_NULL) {
                artifacts.push_back(cell);
            }
        }
    } while (!artifacts.empty());

    return removed_artifacts;
}

void raw_map_generate_water(RawMap* raw_map, const std::vector<ivec2>& goldmines, int* lcg_seed) {
    const int WATER_AVOID_GOLDMINE_RADIUS_SQUARED = PLAYER_SPAWN_SIZE * PLAYER_SPAWN_SIZE;
    const int WATER_WALL_DIST = 10;
    const double WATER_FREQUENCY = 1.0 / 48.0;
    const double WATER_THRESHOLD = 0.25;

    // Generate water
    for (int y = WATER_WALL_DIST; y < raw_map->height - WATER_WALL_DIST - 1; y++) {
        for (int x = WATER_WALL_DIST; x < raw_map->width - WATER_WALL_DIST - 1; x++) {
            ivec2 cell = ivec2(x, y);

            // Only place water on lowground
            if (raw_map->data[x + (y * raw_map->width)] != MAP_VALUE_LOWGROUND) {
                continue;
            }

            // If it is close to a goldmine, then don't place water on it
            uint32_t nearby_goldmine_index;
            for (nearby_goldmine_index = 0; nearby_goldmine_index < goldmines.size(); nearby_goldmine_index++) {
                if (ivec2::euclidean_distance_squared(cell, goldmines[nearby_goldmine_index]) < WATER_AVOID_GOLDMINE_RADIUS_SQUARED) {
                    break;
                }
            }
            if (nearby_goldmine_index < goldmines.size()) {
                continue;
            }

            // Check if this cell is too close to highground
            bool is_too_close_to_highground = false;
            for (int ny = y - WATER_WALL_DIST; ny <= y + WATER_WALL_DIST; ny++) {
                for (int nx = x - WATER_WALL_DIST; nx <= x + WATER_WALL_DIST; nx++) {
                    ivec2 neighbor_cell = ivec2(nx, ny);
                    // Since we started within a margin, the neighbor cell should already be in-bounds

                    if (raw_map->data[nx + (ny * raw_map->width)] == MAP_VALUE_HIGHGROUND &&
                            ivec2::manhattan_distance(cell, neighbor_cell) < WATER_WALL_DIST) {
                        is_too_close_to_highground = true;
                    }
                }
            }
            if (is_too_close_to_highground) {
                continue;
            }

            // Generate a noise value
            double noise_value = (simplex_noise((uint64_t)*lcg_seed, x * WATER_FREQUENCY, y * WATER_FREQUENCY) + 1.0) * 0.5;
            if (noise_value < WATER_THRESHOLD) {
                raw_map->data[x + (y * raw_map->width)] = MAP_VALUE_WATER;
            }
        }
    }

    // Round out the flat edges on all bodies of water
    std::vector<uint8_t> previous_map_data(raw_map->width * raw_map->height);
    for (uint32_t iterations = 0; iterations < 7; iterations++) {
        memcpy(&previous_map_data[0], raw_map->data, raw_map->width * raw_map->height * sizeof(uint8_t));
        for (int y = 0; y < raw_map->height; y++) {
            for (int x = 0; x < raw_map->width; x++) {
                if (previous_map_data[x + (y * raw_map->width)] != MAP_VALUE_WATER) {
                    continue;
                }

                uint32_t lowground_neighbor_count = 0;
                for (int direction = 0; direction < DIRECTION_COUNT; direction++) {
                    ivec2 neighbor = ivec2(x, y) + DIRECTION_IVEC2[direction];
                    if (previous_map_data[neighbor.x + (neighbor.y * raw_map->width)] == MAP_VALUE_LOWGROUND) {
                        lowground_neighbor_count++;
                    }
                }

                if (lowground_neighbor_count >= 4) {
                    raw_map->data[x + (y * raw_map->width)] = MAP_VALUE_LOWGROUND;
                }
            }
        }
    }

    // Remove small bodies of water
    const uint32_t WATER_MIN_BODY_SIZE = 11U;
    std::vector<bool> explored(raw_map->width * raw_map->height, false);
    for (int index = 0; index < raw_map->width * raw_map->height; index++) {
        if (raw_map->data[index] != MAP_VALUE_WATER || explored[index]) {
            continue;
        }

        std::vector<ivec2> water_cells;
        std::vector<ivec2> frontier;

        frontier.push_back(ivec2(index % raw_map->width, index / raw_map->width));
        while (!frontier.empty()) {
            ivec2 next = frontier.back();
            frontier.pop_back();

            if (explored[next.x + (next.y * raw_map->width)]) {
                continue;
            }

            water_cells.push_back(next);
            explored[next.x + (next.y * raw_map->width)] = true;

            for (int direction = 0; direction < DIRECTION_COUNT; direction++) {
                ivec2 child = next + DIRECTION_IVEC2[direction];
                if (!raw_map_is_cell_in_bounds(raw_map, child)) {
                    continue;
                }
                if (raw_map->data[child.x + (child.y * raw_map->width)] != MAP_VALUE_WATER) {
                    continue;
                }
                frontier.push_back(child);
            }
        }

        if (water_cells.size() >= WATER_MIN_BODY_SIZE) {
            continue;
        }

        for (ivec2 water_cell : water_cells) {
            raw_map->data[water_cell.x + (water_cell.y * raw_map->width)] = MAP_VALUE_LOWGROUND;
        }
    }
}

void raw_map_generate_stairs(RawMap* raw_map) {
    struct StairCandidate {
        ivec2 start;
        ivec2 end;
    };

    // Determine which cells are stair candidates
    std::vector<bool> tile_is_stair_candidate(raw_map->width * raw_map->height);
    for (int index = 0; index < raw_map->width * raw_map->height; index++) {
        tile_is_stair_candidate[index] = raw_map_can_stair_be_placed_at_cell(raw_map, ivec2(index % raw_map->width, index / raw_map->width));
    }

    // Determine stair candidate start/end cells based on the candidate tiles
    std::vector<StairCandidate> stair_canidates;
    for (int index = 0; index < raw_map->width * raw_map->height; index++) {
        if (!tile_is_stair_candidate[index]) {
            continue;
        }

        // Determine stair direction
        // Since we are scanning left to right top to bottom,
        // we will only ever discover stairs going east or south
        const ivec2 stair_start = ivec2(index % raw_map->width, index / raw_map->width);
        const ivec2 rightmost_tile = stair_start + ivec2(1, 0);
        const bool rightmost_tile_is_stair_candidate =
            raw_map_is_cell_in_bounds(raw_map, rightmost_tile) &&
            tile_is_stair_candidate[rightmost_tile.x + (rightmost_tile.y * raw_map->width)];
        const Direction stair_direction = rightmost_tile_is_stair_candidate
            ? DIRECTION_EAST
            : DIRECTION_SOUTH;

        // Determine the stair end by walking until we find a non-stair cell
        const ivec2 stair_step = DIRECTION_IVEC2[stair_direction];
        ivec2 stair_end = stair_start + stair_step;
        while (raw_map_is_cell_in_bounds(raw_map, stair_end) &&
                    tile_is_stair_candidate[stair_end.x + (stair_end.y * raw_map->width)]) {
            stair_end += stair_step;
        }

        // Since we have walked into a non-stair cell, we must walk back one step
        stair_end -= stair_step;

        // Remove the candidate cells from consideration
        // so that we don't create multiple stairs from the same tiles
        for (ivec2 stair_cell = stair_start; stair_cell != stair_end + stair_step; stair_cell += stair_step) {
            tile_is_stair_candidate[stair_cell.x + (stair_cell.y * raw_map->width)] = false;
        }

        // Filter out the stair if it is too short
        const int stair_length = ivec2::manhattan_distance(stair_start, stair_end) + 1;
        if (stair_length < 2) {
            continue;
        }

        // Record the stair candidate
        stair_canidates.push_back((StairCandidate) {
            .start = stair_start,
            .end = stair_end
        });
    }

    // Sort the stair candidates in order of length
    std::sort(stair_canidates.begin(), stair_canidates.end(), [](const StairCandidate& a, const StairCandidate& b) {
        return ivec2::manhattan_distance(a.start, a.end) < ivec2::manhattan_distance(b.start, b.end);
    });


    // Determine the list of candidates which will become actual stairs
    std::vector<StairCandidate> chosen_stair_candidates;
    const int MAP_STAIR_SPACING = 16;
    while (!stair_canidates.empty()) {
        const StairCandidate next = stair_canidates.back();
        stair_canidates.pop_back();

        // Filter out stairs that are too close to existing stairs
        bool is_stair_too_close_to_other_stairs = false;
        for (const StairCandidate& chosen_candidate : chosen_stair_candidates) {
            if (ivec2::manhattan_distance(next.start, chosen_candidate.start) < MAP_STAIR_SPACING ||
                    ivec2::manhattan_distance(next.start, chosen_candidate.end) < MAP_STAIR_SPACING ||
                    ivec2::manhattan_distance(next.end, chosen_candidate.start) < MAP_STAIR_SPACING ||
                    ivec2::manhattan_distance(next.end, chosen_candidate.end) < MAP_STAIR_SPACING) {
                is_stair_too_close_to_other_stairs = true;
                break;
            }
        }
        if (is_stair_too_close_to_other_stairs) {
            continue;
        }

        chosen_stair_candidates.push_back(next);
    }

    // Form stairs out of the chosen candidates
    for (const StairCandidate& candidate : chosen_stair_candidates) {
        const ivec2 stair_step = candidate.start.x < candidate.end.x
            ? ivec2(1, 0)
            : ivec2(0, 1);
        for (ivec2 stair_cell = candidate.start; stair_cell != candidate.end + stair_step; stair_cell += stair_step) {
            raw_map->data[stair_cell.x + (stair_cell.y * raw_map->width)] = MAP_VALUE_STAIR;
        }
    }
}

Tile raw_map_get_baked_tile_at_cell(const RawMap* raw_map, MapType map_type, ivec2 cell) {
    const int index = cell.x + (cell.y * raw_map->width);

    if (raw_map->data[index] >= MAP_VALUE_LOWGROUND) {
        // First check if we need to place a regular wall here
        uint32_t neighbors = 0;
        if (raw_map->data[index] == MAP_VALUE_HIGHGROUND ||
                raw_map->data[index] == MAP_VALUE_STAIR ||
                raw_map->data[index] == MAP_VALUE_DECORATION_HIGHGROUND) {
            for (int direction = 0; direction < DIRECTION_COUNT; direction++) {
                ivec2 neighbor_cell = cell + DIRECTION_IVEC2[direction];
                if (!raw_map_is_cell_in_bounds(raw_map, neighbor_cell)) {
                    continue;
                }
                int neighbor_index = neighbor_cell.x + (neighbor_cell.y * raw_map->width);
                if (!(raw_map->data[neighbor_index] == MAP_VALUE_HIGHGROUND ||
                        raw_map->data[neighbor_index] == MAP_VALUE_STAIR ||
                        raw_map->data[neighbor_index] == MAP_VALUE_DECORATION_HIGHGROUND)) {
                    neighbors += DIRECTION_MASK[direction];
                }
            }
        }

        return (Tile) {
            .sprite = (uint8_t)(neighbors == 0
                ? map_get_plain_ground_tile_sprite(map_type)
                : map_wall_autotile_lookup(neighbors)),
            .frame_x = 0,
            .frame_y = 0,
            .elevation = (uint8_t)(raw_map->data[index] == MAP_VALUE_HIGHGROUND ||
                                    raw_map->data[index] == MAP_VALUE_STAIR ||
                                    raw_map->data[index] == MAP_VALUE_DECORATION_HIGHGROUND),
        };
    }

    if (raw_map->data[index] == MAP_VALUE_WATER) {
        uint32_t neighbors = 0;
        // Check adjacent neighbors
        for (int direction = 0; direction < DIRECTION_COUNT; direction += 2) {
            ivec2 neighbor_cell = cell + DIRECTION_IVEC2[direction];
            if (!raw_map_is_cell_in_bounds(raw_map, neighbor_cell) ||
                    raw_map->data[index] == raw_map->data[neighbor_cell.x + (neighbor_cell.y * raw_map->width)]) {
                neighbors += DIRECTION_MASK[direction];
            }
        }
        // Check diagonal neighbors
        for (int direction = 1; direction < DIRECTION_COUNT; direction += 2) {
            ivec2 neighbor_cell = cell + DIRECTION_IVEC2[direction];
            int prev_direction = direction - 1;
            int next_direction = (direction + 1) % DIRECTION_COUNT;
            if ((DIRECTION_MASK[prev_direction] & neighbors) != DIRECTION_MASK[prev_direction] ||
                    (DIRECTION_MASK[next_direction] & neighbors) != DIRECTION_MASK[next_direction]) {
                continue;
            }
            if (!raw_map_is_cell_in_bounds(raw_map, neighbor_cell) ||
                    raw_map->data[index] == raw_map->data[neighbor_cell.x + (neighbor_cell.y * raw_map->width)]) {
                neighbors += DIRECTION_MASK[direction];
            }
        }
        // Set the map tile based on the neighbors
        uint8_t autotile_index = map_neighbors_to_autotile_index(neighbors);
        return (Tile) {
            .sprite = (uint8_t)map_choose_water_tile_sprite(map_type),
            .frame_x = (uint8_t)(autotile_index % AUTOTILE_HFRAMES),
            .frame_y = (uint8_t)(autotile_index / AUTOTILE_HFRAMES),
            .elevation = 0
        };
    }

    return (Tile) {
        .sprite = (uint8_t)SPRITE_TILE_NULL,
        .frame_x = 0,
        .frame_y = 0,
        .elevation = 0
    };
}

bool map_tile_is_south_wall(SpriteName sprite) {
    return sprite == SPRITE_TILE_WALL_SOUTH_EDGE ||
        sprite == SPRITE_TILE_WALL_SW_CORNER ||
        sprite == SPRITE_TILE_WALL_SE_CORNER;
}

bool raw_map_can_stair_be_placed_at_cell(const RawMap* raw_map, ivec2 cell) {
    const int cell_index = cell.x + (cell.y * raw_map->width);
    if (!(raw_map->data[cell_index] == MAP_VALUE_HIGHGROUND || raw_map->data[cell_index] == MAP_VALUE_STAIR)) {
        return false;
    }

    uint32_t lowground_neighbors = 0;
    for (int direction = 0; direction < DIRECTION_COUNT; direction++) {
        ivec2 neighbor_cell = cell + DIRECTION_IVEC2[direction];
        if (!raw_map_is_cell_in_bounds(raw_map, neighbor_cell)) {
            continue;
        }

        const int neighbor_index = neighbor_cell.x + (neighbor_cell.y * raw_map->width);
        if (!(raw_map->data[neighbor_index] == MAP_VALUE_HIGHGROUND || raw_map->data[neighbor_index] == MAP_VALUE_STAIR)) {
            lowground_neighbors += DIRECTION_MASK[direction];
        }
    }

    /*
       This is nearly the same as map_wall_autotile_lookup.
       Generally speaking, a stair can be placed anywhere where
       there is a highground edge in all four directions.

       The exception is with east/west facing walls. If they
       have a highground neighbor in the northeast or northwest
       positions, then that highground neighbor will later create
       a front wall which will block the stair.
    */
    switch (lowground_neighbors) {
        // north-facing
        case 1:
        case 3:
        case 129:
        case 131:
        // south-facing
        case 16:
        case 24:
        case 48:
        case 56:
        // east-facing
        case 6:
        case 14:
        // west-facing
        case 192:
        case 224:
            return true;
        default:
            return false;
    }
}

// MAP SIZE

int map_get_tile_size(MapSize value) {
    switch (value) {
        case MAP_SIZE_SMALL:
            return MAP_TILE_SIZE_SMALL;
        case MAP_SIZE_MEDIUM:
            return MAP_TILE_SIZE_MEDIUM;
        case MAP_SIZE_LARGE:
            return MAP_TILE_SIZE_LARGE;
        case MAP_SIZE_COUNT: {
            return 0;
        }
    }
}

MapSize map_get_map_size_from_tile_size(int value) {
    switch (value) {
        case MAP_TILE_SIZE_SMALL:
            return MAP_SIZE_SMALL;
        case MAP_TILE_SIZE_MEDIUM:
            return MAP_SIZE_MEDIUM;
        case MAP_TILE_SIZE_LARGE:
            return MAP_SIZE_LARGE;
        default: {
            return MAP_SIZE_COUNT;
        }
    }
}

// GOLDMINES

void raw_map_save_goldmines(RawMap* raw_map, const std::vector<ivec2>& goldmines) {
    for (uint32_t goldmine_index = 0; goldmine_index < goldmines.size(); goldmine_index++) {
        ivec2 goldmine_cell = raw_map_get_goldmine_position(raw_map, goldmines, goldmine_index);

        uint32_t goldmine_map_index = goldmine_cell.x + (goldmine_cell.y * raw_map->width);
        if (raw_map->data[goldmine_map_index] == MAP_VALUE_LOWGROUND) {
            raw_map->data[goldmine_map_index] = MAP_VALUE_GOLDMINE_LOWGROUND;
        } else if (raw_map->data[goldmine_map_index] == MAP_VALUE_HIGHGROUND) {
            raw_map->data[goldmine_map_index] = MAP_VALUE_GOLDMINE_HIGHGROUND;
        }
    }
}

ivec2 raw_map_get_player_goldmine_position(const RawMap* raw_map, uint32_t player_id) {
    switch (player_id) {
        // Northwest corner
        case 0:
            return ivec2(PLAYER_SPAWN_MARGIN, PLAYER_SPAWN_MARGIN);
        // Northeast corner
        case 1:
            return ivec2(raw_map->width - PLAYER_SPAWN_MARGIN - GOLDMINE_SIZE, PLAYER_SPAWN_MARGIN);
        // Southeast corner
        case 2:
            return ivec2(raw_map->width - PLAYER_SPAWN_MARGIN - GOLDMINE_SIZE, raw_map->height - PLAYER_SPAWN_MARGIN - GOLDMINE_SIZE);
        // Southwest corner
        case 3:
            return ivec2(PLAYER_SPAWN_MARGIN, raw_map->height - PLAYER_SPAWN_MARGIN - GOLDMINE_SIZE);
        default: {
            return ivec2(-1, -1);
        }
    }
}

ivec2 raw_map_get_goldmine_position(const RawMap* raw_map, const std::vector<ivec2>& goldmines, uint32_t goldmine_index) {
    switch (goldmine_index) {
        case 0:
        case 1:
        case 2:
        case 3:
            return raw_map_get_player_goldmine_position(raw_map, goldmine_index);
        default:
            return goldmines[goldmine_index];
    }
}

// Extracts the goldmine values from the map and saves all the goldmines into a list of ivec2s
std::vector<ivec2> raw_map_extract_goldmines(RawMap* raw_map) {
    std::vector<ivec2> goldmines;

    for (int index = 0; index < raw_map->width * raw_map->height; index++) {
        if (raw_map->data[index] == MAP_VALUE_GOLDMINE_LOWGROUND || raw_map->data[index] == MAP_VALUE_GOLDMINE_HIGHGROUND) {
            goldmines.push_back(ivec2(index % raw_map->width, index / raw_map->width));
            raw_map->data[index] = raw_map->data[index] == MAP_VALUE_GOLDMINE_LOWGROUND
                ? MAP_VALUE_LOWGROUND
                : MAP_VALUE_HIGHGROUND;
        }
    }

    return goldmines;
}

std::vector<ivec2> map_generate_goldmines(int map_width, int map_height, int* lcg_seed) {
    std::vector<ivec2> goldmines;

    // Determine player spawns
    const int PLAYER_SPAWN_CENTER_DISTANCE = PLAYER_SPAWN_MARGIN + (PLAYER_SPAWN_SIZE / 2);

    // Northwest corner
    goldmines.push_back(ivec2(PLAYER_SPAWN_MARGIN, PLAYER_SPAWN_CENTER_DISTANCE));
    // Northeast corner
    goldmines.push_back(ivec2(map_width - PLAYER_SPAWN_MARGIN - GOLDMINE_SIZE, PLAYER_SPAWN_CENTER_DISTANCE));
    // Southeast corner
    goldmines.push_back(ivec2(map_width - PLAYER_SPAWN_MARGIN - GOLDMINE_SIZE, map_height - PLAYER_SPAWN_CENTER_DISTANCE - GOLDMINE_SIZE));
    // Southwest corner
    goldmines.push_back(ivec2(PLAYER_SPAWN_MARGIN, map_height - PLAYER_SPAWN_CENTER_DISTANCE - GOLDMINE_SIZE));

    const MapSize map_size = map_get_map_size_from_tile_size(map_width);
    const uint32_t goldmines_to_generate = map_gen_get_number_of_goldmines_to_generate(map_size);

    const uint32_t GOLDMINE_SAMPLES_TO_GENERATE = 10;
    const int GOLDMINE_DISK_RADIUS = 48;
    const int GOLDMINE_SPAWN_MARGIN = 4;
    const int SAMPLE_NOT_FOUND = 0;
    while (goldmines.size() < goldmines_to_generate) {
        ivec2 best_sample;
        int best_sample_distance = SAMPLE_NOT_FOUND;
        for (uint32_t sample_index = 0; sample_index < GOLDMINE_SAMPLES_TO_GENERATE; sample_index++) {
            ivec2 sample;
            sample.x = GOLDMINE_SPAWN_MARGIN + (lcg_rand(lcg_seed) % (map_width - (2 * GOLDMINE_SPAWN_MARGIN)));
            sample.y = GOLDMINE_SPAWN_MARGIN + (lcg_rand(lcg_seed) % (map_height - (2 * GOLDMINE_SPAWN_MARGIN)));

            int min_distance = INT32_MAX;
            for (uint32_t goldmine_index = 0; goldmine_index < goldmines.size(); goldmine_index++) {
                int distance = ivec2::manhattan_distance(sample, goldmines[goldmine_index]);
                if (distance < min_distance) {
                    min_distance = distance;
                }
            }

            if (min_distance < GOLDMINE_DISK_RADIUS) {
                continue;
            }

            if (min_distance > best_sample_distance) {
                best_sample = sample;
                best_sample_distance = min_distance;
            }
        }

        if (best_sample_distance != SAMPLE_NOT_FOUND) {
            goldmines.push_back(best_sample);
        }
    }

    return goldmines;
}

uint32_t map_gen_get_number_of_goldmines_to_generate(MapSize map_size) {
    switch (map_size) {
        case MAP_SIZE_SMALL:
            return MAX_PLAYERS;
        case MAP_SIZE_MEDIUM:
            return MAX_PLAYERS + 2;
        case MAP_SIZE_LARGE:
            return MAX_PLAYERS + 4;
        case MAP_SIZE_COUNT:
            return 0;
    }
}

// BAKE HELPERS

Direction map_get_tile_stair_direction(const Tile& tile) {
    switch (tile.sprite) {
        case SPRITE_TILE_WALL_NORTH_EDGE:
            return DIRECTION_NORTH;
        case SPRITE_TILE_WALL_EAST_EDGE:
            return DIRECTION_EAST;
        case SPRITE_TILE_WALL_WEST_EDGE:
            return DIRECTION_WEST;
        case SPRITE_TILE_WALL_SOUTH_EDGE:
            return DIRECTION_SOUTH;
        default:
            return DIRECTION_COUNT;
    }
}

SpriteName map_choose_ground_tile_sprite(MapType map_type, int index, int* lcg_seed) {
    switch (map_type) {
        case MAP_TYPE_TOMBSTONE: {
            int new_index = lcg_rand(lcg_seed) % 7;
            if (new_index == 1 && index % 3 == 0) {
                return SPRITE_TILE_SAND3;
            } else if (new_index < 4 && index % 3 == 0) {
                return SPRITE_TILE_SAND2;
            } else {
                return SPRITE_TILE_SAND1;
            }
        }
        case MAP_TYPE_BOULDER: {
            int roll = lcg_rand(lcg_seed) % 20;
            if (roll < 5 && index % 2 == 1) {
                return SPRITE_TILE_GRASS3;
            } else if (roll >= 5 && roll < 10 && index % 2 == 0) {
                return SPRITE_TILE_GRASS2;
            } else if (roll >= 18 && index % 13 == 0) {
                return lcg_rand(lcg_seed) % 5 < 2 ? SPRITE_TILE_GRASS4 : SPRITE_TILE_GRASS5;
            // } else if (roll == 19 && index % 7 == 0) {
                // return SPRITE_TILE_GRASS5;
            } else {
                return SPRITE_TILE_GRASS1;
            }
        }
        case MAP_TYPE_KLONDIKE: {
            int new_index = lcg_rand(lcg_seed) % 20;
            if (new_index == 1 && index % 7 == 0) {
                return SPRITE_TILE_SNOW3;
            } else if (new_index == 0 && index % 7 == 0) {
                return SPRITE_TILE_SNOW2;
            } else {
                return SPRITE_TILE_SNOW1;
            }
        }
        case MAP_TYPE_COUNT: {
            return SPRITE_TILE_NULL;
        }
    }
}

SpriteName map_choose_water_tile_sprite(MapType map_type) {
    switch (map_type) {
        case MAP_TYPE_TOMBSTONE:
            return SPRITE_TILE_SAND_WATER;
        case MAP_TYPE_BOULDER:
            return SPRITE_TILE_GRASS_WATER;
        case MAP_TYPE_KLONDIKE:
            return SPRITE_TILE_SNOW_WATER;
        case MAP_TYPE_COUNT: {
            return SPRITE_TILE_NULL;
        }
    }
}

SpriteName map_get_plain_ground_tile_sprite(MapType map_type) {
    switch (map_type) {
        case MAP_TYPE_TOMBSTONE:
            return SPRITE_TILE_SAND1;
        case MAP_TYPE_BOULDER:
            return SPRITE_TILE_GRASS1;
        case MAP_TYPE_KLONDIKE:
            return SPRITE_TILE_SNOW1;
        case MAP_TYPE_COUNT: {
            return SPRITE_TILE_NULL;
        }
    }
}

SpriteName map_get_decoration_sprite(MapType map_type) {
    switch (map_type) {
        case MAP_TYPE_TOMBSTONE:
            return SPRITE_DECORATION_ARIZONA;
        case MAP_TYPE_BOULDER:
            return SPRITE_DECORATION_BOULDER;
        case MAP_TYPE_KLONDIKE:
            return SPRITE_DECORATION_KLONDIKE;
        case MAP_TYPE_COUNT: {
            return SPRITE_TILE_NULL;
        }
    }
}

SpriteName map_wall_autotile_lookup(uint32_t neighbors) {
    switch (neighbors) {
        case 1:
        case 3:
        case 129:
        case 131:
            return SPRITE_TILE_WALL_NORTH_EDGE;
        case 4:
        case 6:
        case 12:
        case 14:
            return SPRITE_TILE_WALL_EAST_EDGE;
        case 16:
        case 24:
        case 48:
        case 56:
            return SPRITE_TILE_WALL_SOUTH_EDGE;
        case 64:
        case 96:
        case 192:
        case 224:
            return SPRITE_TILE_WALL_WEST_EDGE;
        case 7:
        case 15:
        case 135:
        case 143:
        case 66:
            return SPRITE_TILE_WALL_NE_CORNER;
        case 193:
        case 195:
        case 225:
        case 227:
        case 132:
            return SPRITE_TILE_WALL_NW_CORNER;
        case 112:
        case 120:
        case 240:
        case 248:
        case 72:
            return SPRITE_TILE_WALL_SW_CORNER;
        case 28:
        case 30:
        case 60:
        case 62:
        case 36:
            return SPRITE_TILE_WALL_SE_CORNER;
        case 2:
            return SPRITE_TILE_WALL_NE_INNER_CORNER;
        case 8:
            return SPRITE_TILE_WALL_SE_INNER_CORNER;
        case 32:
            return SPRITE_TILE_WALL_SW_INNER_CORNER;
        case 128:
            return SPRITE_TILE_WALL_NW_INNER_CORNER;
        default:
            return SPRITE_TILE_NULL;
    }
}

uint8_t map_neighbors_to_autotile_index(uint32_t p_neighbors) {
    static uint8_t autotile_index[256];
    static bool initialized = false;
    if (!initialized) {
        uint8_t unique_index = 0;
        for (uint32_t neighbors = 0; neighbors < 256; neighbors++) {
            bool is_unique = true;
            for (int direction = 0; direction < DIRECTION_COUNT; direction++) {
                if (direction % 2 == 1 && (DIRECTION_MASK[direction] & neighbors) == DIRECTION_MASK[direction]) {
                    int prev_direction = direction - 1;
                    int next_direction = (direction + 1) % DIRECTION_COUNT;
                    if ((DIRECTION_MASK[prev_direction] & neighbors) != DIRECTION_MASK[prev_direction] ||
                        (DIRECTION_MASK[next_direction] & neighbors) != DIRECTION_MASK[next_direction]) {
                        is_unique = false;
                        break;
                    }
                }
            }
            if (!is_unique) {
                continue;
            }
            autotile_index[neighbors] = unique_index;
            unique_index++;
        }

        initialized = true;
    }

    return autotile_index[p_neighbors];
}

// DECORATIONS

void raw_map_generate_decorations(RawMap* raw_map, MapType map_type, int* lcg_seed) {
    const SpriteName GROUND_TILE_SPRITE = map_get_plain_ground_tile_sprite(MAP_TYPE_BOULDER);
    const int DECORATION_AVOID_STAIR_RADIUS = 6;
    const int DECORATION_AVOID_GOLDMINE_RADIUS = 16;
    const int DECORATION_DISK_RADIUS = 16;

    PoissonDiskParams* params = poisson_disk_params_init(raw_map->width, raw_map->height, DECORATION_DISK_RADIUS, lcg_seed);

    // Set avoid values
    for (int y = 0; y < raw_map->height; y++) {
        for (int x = 0; x < raw_map->width; x++) {
            const uint8_t map_value = raw_map->data[x + (y * raw_map->width)];

            // Avoid stairs
            if (map_value == MAP_VALUE_STAIR) {
                poisson_disk_avoid_cell(params, ivec2(x, y), DECORATION_AVOID_STAIR_RADIUS);
                continue;
            }

            // Avoid goldmines
            if (map_value == MAP_VALUE_GOLDMINE_LOWGROUND || map_value == MAP_VALUE_GOLDMINE_HIGHGROUND) {
                poisson_disk_avoid_cell(params, ivec2(x, y), DECORATION_AVOID_GOLDMINE_RADIUS);
                continue;
            }

            // Avoid walls and water
            Tile tile = raw_map_get_baked_tile_at_cell(raw_map, MAP_TYPE_BOULDER, ivec2(x, y));
            if (tile.sprite == GROUND_TILE_SPRITE) {
                continue;
            }
            poisson_disk_avoid_cell(params, ivec2(x, y), 1);

            // Avoid front walls
            const bool tile_will_generate_front_wall =
                raw_map_is_cell_in_bounds(raw_map, ivec2(x, y + 1)) &&
                (tile.sprite == SPRITE_TILE_WALL_SOUTH_EDGE ||
                tile.sprite == SPRITE_TILE_WALL_SW_CORNER ||
                tile.sprite == SPRITE_TILE_WALL_SE_CORNER);
            if (tile_will_generate_front_wall) {
                poisson_disk_avoid_cell(params, ivec2(x, y + 1), 1);
            }
        }
    }

    // For tree decorations, avoid the top row
    if (map_type == MAP_TYPE_KLONDIKE || map_type == MAP_TYPE_BOULDER) {
        for (int x = 0; x < raw_map->width; x++) {
            // y is 0, so it is not added to the index
            params->avoid_value[x]++;
        }
    }

    std::vector<ivec2> decoration_cells = poisson_disk(params);

    // Save decorations
    switch (map_type) {
        case MAP_TYPE_TOMBSTONE: {
            raw_map_save_decorations_cacti(raw_map, decoration_cells);
            break;
        }
        case MAP_TYPE_BOULDER:
        case MAP_TYPE_KLONDIKE: {
            raw_map_save_decorations_trees(raw_map, params, decoration_cells);
            break;
        }
        case MAP_TYPE_COUNT: {
            break;
        }
    }

    free(params);
}

void raw_map_save_decorations_cacti(RawMap* raw_map, const std::vector<ivec2>& decoration_cells) {
    for (ivec2 cell : decoration_cells) {
        raw_map->data[cell.x + (cell.y * raw_map->width)] =
            raw_map->data[cell.x + (cell.y * raw_map->width)] == MAP_VALUE_LOWGROUND
                ? MAP_VALUE_DECORATION_LOWGROUND
                : MAP_VALUE_DECORATION_HIGHGROUND;
    }
}

void raw_map_save_decorations_trees(RawMap* raw_map, PoissonDiskParams* params, const std::vector<ivec2>& decoration_cells) {
    struct TreeNode {
        ivec2 cell;
        ivec2 source_cell;
    };

    const int TREE_MAX_DISTANCE_FROM_SOURCE_CELL = 8;
    const double FOREST_NOISE_FREQUENCY = 1.0 / 8.0;
    const double FOREST_NOISE_THRESHOLD = 0.25;

    std::vector<TreeNode> frontier;
    std::vector<bool> explored(raw_map->width * raw_map->height, false);

    // Init frontier and clear existing decoration avoid values
    for (ivec2 cell : decoration_cells) {
        frontier.push_back((TreeNode) {
            .cell = cell,
            .source_cell = cell
        });

        // The decoration avoid values generated during poisson disk
        // will prevent us from being able to place any decorations
        // so we will clear them here
        poisson_disk_unavoid_cell(params, cell, params->disk_radius);
    }

    while (!frontier.empty()) {
        TreeNode next = frontier.back();
        frontier.pop_back();

        // Check if cell is valid
        const int cell_index = next.cell.x + (next.cell.y * raw_map->width);
        if (poisson_disk_should_avoid_cell(params, next.cell)) {
            continue;
        }

        // Save decoration
        raw_map->data[cell_index] =  raw_map->data[cell_index] == MAP_VALUE_LOWGROUND
            ? MAP_VALUE_DECORATION_LOWGROUND
            : MAP_VALUE_DECORATION_HIGHGROUND;
        params->avoid_value[cell_index]++;
        explored[cell_index] = true;

        for (int direction = 1; direction < DIRECTION_COUNT; direction += 2) {
            ivec2 child = next.cell + DIRECTION_IVEC2[direction];

            // Filter out out-of-bounds children
            if (!raw_map_is_cell_in_bounds(raw_map, child)) {
                continue;
            }

            // Filter out already-explored cells
            if (explored[child.x + (child.y * raw_map->width)]) {
                continue;
            }

            // Filter out cells that are too far from their source
            if (ivec2::manhattan_distance(child, next.source_cell) > TREE_MAX_DISTANCE_FROM_SOURCE_CELL) {
                continue;
            }

            // Filter out cells that don't fit the noise
            double forest_noise_value = (simplex_noise((uint64_t)params->lcg_seed, child.x * FOREST_NOISE_FREQUENCY, child.y * FOREST_NOISE_FREQUENCY) + 1.0) * 0.5;
            if (forest_noise_value >= FOREST_NOISE_THRESHOLD) {
                continue;
            }

            frontier.push_back((TreeNode) {
                .cell = child,
                .source_cell = next.source_cell
            });
        } // End for each direction
    } // End while not frontier empty
}

std::vector<ivec2> raw_map_get_decorations(const RawMap* raw_map) {
    std::vector<ivec2> decoration_cells;

    for (int y = 0; y < raw_map->height; y++) {
        for (int x = 0; x < raw_map->width; x++) {
            int index = x + (y * raw_map->width);
            const bool is_decoration_cell =
                raw_map->data[index] == MAP_VALUE_DECORATION_LOWGROUND ||
                raw_map->data[index] == MAP_VALUE_DECORATION_HIGHGROUND;
            if (is_decoration_cell) {
                decoration_cells.push_back(ivec2(x, y));
            }
        }
    }

    return decoration_cells;
}

std::vector<ivec2> raw_map_extract_decorations(RawMap* raw_map) {
    std::vector<ivec2> decoration_cells = raw_map_get_decorations(raw_map);

    // Remove the decorations from the map
    for (ivec2 cell : decoration_cells) {
        int index = cell.x + (cell.y * raw_map->width);
        raw_map->data[index] = raw_map->data[index] == MAP_VALUE_DECORATION_LOWGROUND
            ? MAP_VALUE_LOWGROUND
            : MAP_VALUE_HIGHGROUND;
    }

    return decoration_cells;
}

// POISSON DISK

PoissonDiskParams* poisson_disk_params_init(int map_width, int map_height, int disk_radius, int* lcg_seed) {
    PoissonDiskParams* params = (PoissonDiskParams*)malloc(sizeof(PoissonDiskParams));

    params->map_width = map_width;
    params->map_height = map_height;
    memset(params->avoid_value, 0, sizeof(params->avoid_value));
    params->disk_radius = disk_radius;
    params->lcg_seed = lcg_seed;

    return params;
}

void poisson_disk_update_avoid_value(PoissonDiskParams* params, ivec2 position, int radius, int value) {
    for (int y = std::max(position.y - radius, 0); y <= std::min(position.y + radius, params->map_height - 1); y++) {
        for (int x = std::max(position.x - radius, 0); x <= std::min(position.x + radius, params->map_width - 1); x++) {
            if (ivec2::manhattan_distance(ivec2(x, y), position) <= radius) {
                int index = x + (y * params->map_width);
                params->avoid_value[index] = std::max(params->avoid_value[index] + value, 0);
            }
        }
    }
}

void poisson_disk_avoid_cell(PoissonDiskParams* params, ivec2 position, int radius) {
    poisson_disk_update_avoid_value(params, position, radius, 1);
}

void poisson_disk_unavoid_cell(PoissonDiskParams* params, ivec2 position, int radius) {
    poisson_disk_update_avoid_value(params, position, radius, -1);
}

bool poisson_disk_should_avoid_cell(const PoissonDiskParams* params, ivec2 cell) {
    return params->avoid_value[cell.x + (cell.y * params->map_width)] > 0;
}

std::vector<ivec2> poisson_disk_get_circle_offset_points(int disk_radius) {
    std::vector<ivec2> circle_offset_points;

    int x = 0;
    int y = disk_radius;
    int d = 3 - 2 * disk_radius;
    circle_offset_points.push_back(ivec2(x, y));
    circle_offset_points.push_back(ivec2(-x, y));
    circle_offset_points.push_back(ivec2(x, -y));
    circle_offset_points.push_back(ivec2(-x, -y));
    circle_offset_points.push_back(ivec2(y, x));
    circle_offset_points.push_back(ivec2(-y, x));
    circle_offset_points.push_back(ivec2(y, -x));
    circle_offset_points.push_back(ivec2(-y, -x));
    while (y >= x) {
        if (d > 0) {
            y--;
            d += 4 * (x - y) + 10;
        } else {
            d += 4 * x + 6;
        }
        x++;
        circle_offset_points.push_back(ivec2(x, y));
        circle_offset_points.push_back(ivec2(-x, y));
        circle_offset_points.push_back(ivec2(x, -y));
        circle_offset_points.push_back(ivec2(-x, -y));
        circle_offset_points.push_back(ivec2(y, x));
        circle_offset_points.push_back(ivec2(-y, x));
        circle_offset_points.push_back(ivec2(y, -x));
        circle_offset_points.push_back(ivec2(-y, -x));
    }

    return circle_offset_points;
}

bool poisson_disk_is_cell_valid(const PoissonDiskParams* params, ivec2 cell) {
    if (cell.x < 0 || cell.y < 0 || cell.x >= params->map_width || cell.y >= params->map_height) {
        return false;
    }
    return !poisson_disk_should_avoid_cell(params, cell);
}

std::vector<ivec2> poisson_disk(PoissonDiskParams* params) {
    const std::vector<ivec2> circle_offset_points = poisson_disk_get_circle_offset_points(params->disk_radius);
    std::vector<ivec2> sample;
    std::vector<ivec2> frontier;

    // Determine first cell
    ivec2 first;
    uint32_t attempts = 0;
    const uint32_t MAX_ATTEMPTS = 1000;
    do {
        first.x = 1 + (lcg_rand(params->lcg_seed) % (params->map_width - 2));
        first.y = 1 + (lcg_rand(params->lcg_seed) % (params->map_height - 2));
        attempts++;
    } while (!poisson_disk_is_cell_valid(params, first) && attempts < MAX_ATTEMPTS);
    if (!poisson_disk_is_cell_valid(params, first)) {
        return sample;
    }

    frontier.push_back(first);
    sample.push_back(first);
    poisson_disk_avoid_cell(params, first, params->disk_radius);

    while (!frontier.empty()) {
        int next_index = lcg_rand(params->lcg_seed) % frontier.size();
        ivec2 next = frontier[next_index];

        int child_attempts = 0;
        ivec2 child;
        do {
            child = next + circle_offset_points[lcg_rand(params->lcg_seed) % circle_offset_points.size()];
            child_attempts++;
        } while (!poisson_disk_is_cell_valid(params, child) && child_attempts < 30);

        if (poisson_disk_is_cell_valid(params, child)) {
            frontier.push_back(child);
            sample.push_back(child);
            poisson_disk_avoid_cell(params, child, params->disk_radius);
        } else {
            frontier[next_index] = frontier.back();
            frontier.pop_back();
        }
    }

    return sample;
}

// FINALIZE

ivec2 raw_map_get_player_hall_location(const RawMap* raw_map, uint32_t player_id) {
    const int GOLDMINE_HALL_DISTANCE = 4;

    ivec2 goldmine_position = raw_map_get_player_goldmine_position(raw_map, player_id);
    return ivec2(
        goldmine_position.x == PLAYER_SPAWN_MARGIN
            ? goldmine_position.x
            : goldmine_position.x - 1,
        goldmine_position.y == PLAYER_SPAWN_MARGIN
            ? goldmine_position.y + GOLDMINE_SIZE + GOLDMINE_HALL_DISTANCE
            : goldmine_position.y - HALL_SIZE - GOLDMINE_HALL_DISTANCE
    );
}

bool raw_map_is_player_spawn_valid(const RawMap* raw_map, uint32_t player_id) {
    ivec2 player_hall_location = raw_map_get_player_hall_location(raw_map, player_id);
    Rect player_hall_rect = (Rect) {
        .x = player_hall_location.x - 1,
        .y = player_hall_location.y - 1,
        .w = HALL_SIZE + 2,
        .h = HALL_SIZE + 2
    };
    for (int y = player_hall_rect.y; y < player_hall_rect.y + player_hall_rect.h; y++) {
        for (int x = player_hall_rect.x; x < player_hall_rect.x + player_hall_rect.w; x++) {
            if (!raw_map_is_cell_in_bounds(raw_map, ivec2(x, y))) {
                return false;
            }

            // Check this value against the top-left value to ensure the entire area is flat
            // It is safe to check the top-left value because we will have bounds-checked it first
            if (raw_map->data[x + (y * raw_map->width)] != raw_map->data[player_hall_rect.x + (player_hall_rect.y * raw_map->width)]) {
                return false;
            }
        }
    }

    return true;
}

bool raw_map_is_valid(const RawMap* raw_map) {
    // Check player spawn locations
    for (uint32_t player_id = 0; player_id < MAX_PLAYERS; player_id++) {
        bool is_player_spawn_valid = raw_map_is_player_spawn_valid(raw_map, player_id);
        if (!is_player_spawn_valid) {
            return false;
        }
    }

    // Determine blocked tiles
    // Also while we are doing this, store the goldmine cells for use later
    std::vector<bool> is_tile_blocked(raw_map->width * raw_map->height, false);
    std::vector<ivec2> goldmine_cells;
    for (int y = 0; y < raw_map->height; y++) {
        for (int x = 0; x < raw_map->width; x++) {
            uint8_t value = raw_map->data[x + (y * raw_map->width)];
            switch (value) {
                case MAP_VALUE_LOWGROUND:
                case MAP_VALUE_STAIR:
                    break;
                case MAP_VALUE_HIGHGROUND: {
                    uint32_t lowground_neighbors = 0;
                    for (int direction = 0; direction < DIRECTION_COUNT; direction++) {
                        ivec2 neighbor_cell = ivec2(x, y) + DIRECTION_IVEC2[direction];
                        if (!raw_map_is_cell_in_bounds(raw_map, neighbor_cell)) {
                            continue;
                        }
                        if (raw_map->data[neighbor_cell.x + (neighbor_cell.y * raw_map->width)] == MAP_VALUE_LOWGROUND) {
                            lowground_neighbors += DIRECTION_MASK[direction];
                        }
                    }

                    if (lowground_neighbors != 0) {
                        is_tile_blocked[x + (y * raw_map->width)] = true;
                        SpriteName wall_sprite = map_wall_autotile_lookup(lowground_neighbors);
                        if (map_tile_is_south_wall(wall_sprite) && y < raw_map->height - 1) {
                            is_tile_blocked[x + ((y + 1) * raw_map->width)] = true;
                        }
                    }

                    break;
                }
                case MAP_VALUE_DECORATION_LOWGROUND:
                case MAP_VALUE_DECORATION_HIGHGROUND:
                case MAP_VALUE_WATER: {
                    is_tile_blocked[x + (y * raw_map->width)] = true;
                    break;
                }
                case MAP_VALUE_GOLDMINE_LOWGROUND:
                case MAP_VALUE_GOLDMINE_HIGHGROUND: {
                    for (int gy = y; gy < y + GOLDMINE_SIZE; gy++) {
                        for (int gx = x; gx < x + GOLDMINE_SIZE; gx++) {
                            is_tile_blocked[gx + (gy * raw_map->width)] = true;
                        }
                    }
                    goldmine_cells.push_back(ivec2(x, y));
                    break;
                }
                default: {
                    break;
                }
            }
        }
    }

    // Check for map traversability by flood filling in 2x2 regions
    uint32_t island_count = 0;
    std::vector<uint32_t> island_of(raw_map->width * raw_map->height, ISLAND_UNASSIGNED);
    for (int index = 0; index < raw_map->width * raw_map->height; index++) {
        // Don't proceed with a cell that is blocked or is already assigned to an island
        if (island_of[index] != ISLAND_UNASSIGNED || is_tile_blocked[index]) {
            continue;
        }

        // Don't proceed with this cell if it isn't already a valid 2x2
        ivec2 index_cell = ivec2(index % raw_map->width, index / raw_map->width);
        if (!raw_map_is_cell_rect_in_bounds(raw_map, index_cell, 2)) {
            continue;
        }
        if (!raw_map_is_cell_open_for_2x2_units(raw_map, is_tile_blocked, index_cell)) {
            continue;
        }

        // Flood fill the island
        std::vector<ivec2> frontier;
        frontier.push_back(index_cell);
        while (!frontier.empty()) {
            ivec2 next = frontier.back();
            frontier.pop_back();

            // Check if cell is already explored
            if (island_of[next.x + (next.y * raw_map->width)] != ISLAND_UNASSIGNED) {
                continue;
            }

            island_of[next.x + (next.y * raw_map->width)] = island_count;

            for (int direction = 0; direction < DIRECTION_COUNT; direction += 2) {
                ivec2 child = next + DIRECTION_IVEC2[direction];
                if (!raw_map_is_cell_rect_in_bounds(raw_map, child, 2)) {
                    continue;
                }
                if (!raw_map_is_cell_open_for_2x2_units(raw_map, is_tile_blocked, index_cell)) {
                    continue;
                }
                frontier.push_back(child);
            }

        }

        island_count++;
    }

    // Check to make sure that all goldmines are on the same island
    if (!goldmine_cells.empty()) {
        uint32_t first_goldmine_island = island_of[goldmine_cells[0].x + (goldmine_cells[0].y * raw_map->width)];
        for (uint32_t index = 1; index < goldmine_cells.size(); index++) {
            ivec2 goldmine_cell = goldmine_cells[index];
            uint32_t goldmine_island = island_of[goldmine_cell.x + (goldmine_cell.y * raw_map->width)];
            if (goldmine_island != first_goldmine_island) {
                return false;
            }
        }
    }

    return true;
}

bool raw_map_is_cell_open_for_2x2_units(const RawMap* raw_map, const std::vector<bool>& is_tile_blocked, ivec2 cell) {
    if (is_tile_blocked[cell.x + (cell.y * raw_map->width)]) {
        return false;
    }

    uint32_t open_neighbors = 0;
    for (int direction = 0; direction < DIRECTION_COUNT; direction++) {
        ivec2 neighbor = cell + DIRECTION_IVEC2[direction];
        if (!raw_map_is_cell_in_bounds(raw_map, neighbor)) {
            continue;
        }
        if (!is_tile_blocked[neighbor.x + (neighbor.y * raw_map->width)]) {
            open_neighbors |= DIRECTION_MASK[direction];
        }
    }

    for (int index = 0; index < 4; index++) {
        if ((open_neighbors & VALID_2X2_MASKS[index]) == VALID_2X2_MASKS[index]) {
            return true;
        }
    }

    return false;
}

// FILE

void raw_map_fwrite(const RawMap* raw_map, FILE* file) {
    fwrite(&raw_map->width, 1, sizeof(raw_map->width), file);
    fwrite(&raw_map->height, 1, sizeof(raw_map->height), file);
    fwrite(raw_map->data, 1, raw_map->width * raw_map->height * sizeof(uint8_t), file);
}

void raw_map_memread(RawMap* raw_map, MemCursor* cursor) {
    int width, height;
    memread(&width, sizeof(width), cursor);
    memread(&height, sizeof(height), cursor);
    if (width <= 0 || height <= 0 || width > MAP_TILE_SIZE_MAX || height > MAP_TILE_SIZE_MAX) { // ANALYZER: bounds check for untrusted replay data
        throw std::runtime_error("Replay map size is out of range."); // ANALYZER: bounds check for untrusted replay data
    } // ANALYZER: bounds check for untrusted replay data

    raw_map_init(raw_map, width, height);
    memread(raw_map->data, raw_map->width * raw_map->height * sizeof(uint8_t), cursor);
}
