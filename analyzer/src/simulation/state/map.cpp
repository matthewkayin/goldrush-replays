#include "map.h"

#include "simulation/state/map_gen.h"
#include "simulation/render/sprite.h"
#include "simulation/util/lcg.h"
#include <cstring>
#include <algorithm>

static const int MAP_ISLAND_UNASSIGNED = -1;
static const uint8_t MAP_REGION_UNASSIGNED = UINT8_MAX;
static const uint8_t MAP_REGIONS_NOT_CONNECTED = UINT8_MAX;
static const uint8_t MAP_REGION_CONNECTIONS_NOT_CONNECTED = UINT8_MAX;
static const uint32_t PATHFIND_ITERATION_MAX = 1999;

void map_init(Map& map, MapType map_type, const RawMap* raw_map, int* lcg_seed) {
    memset(&map, 0, sizeof(map));

    map.type = map_type;
    map.width = raw_map->width;
    map.height = raw_map->height;

    // Init tiles
    for (int index = 0; index < map.width * map.height; index++) {
        map.tiles[index] = (Tile) {
            .sprite = (uint8_t)map_get_plain_ground_tile_sprite(map_type),
            .frame_x = 0,
            .frame_y = 0,
            .elevation = 0
        };
    }

    // Init cells
    map_clear_cells(map);

    // Create decorations
    const std::vector<ivec2> decorations = raw_map_get_decorations(raw_map);
    for (ivec2 decoration_cell : decorations) {
        map_create_decoration_at_cell(map, decoration_cell, lcg_seed);
    }

    map_bake(map, raw_map, lcg_seed);
    map_block_walls_and_water(map);
    map_calculate_unreachable_cells(map);
    map_init_regions(map);
}

void map_clear_cells(Map& map) {
    for (int layer = 0; layer < CELL_LAYER_COUNT; layer++) {
        for (int index = 0; index < map.width * map.height; index++) {
            map.cells[layer][index] = (Cell) {
                .type = CELL_EMPTY,
                .id = ID_NULL
            };
        }
    }
}

void map_block_walls_and_water(Map& map) {
    for (int index = 0; index < map.width * map.height; index++) {
        ivec2 cell = ivec2(index % map.width, index / map.width);
        if (!map_is_tile_ground(map, cell) && !map_is_tile_ramp(map, cell)) {
            map.cells[CELL_LAYER_GROUND][index].type = CELL_BLOCKED;
        }
    }
}

void map_bake(Map& map, const RawMap* raw_map, int* lcg_seed) {
    const SpriteName GROUND_TILE_SPRITE = map_get_plain_ground_tile_sprite(map.type);

    // Bake tiles
    for (int index = 0; index < map.width * map.height; index++) {
        ivec2 cell = ivec2(index % map.width, index / map.width);
        map.tiles[index] = raw_map_get_baked_tile_at_cell(raw_map, map.type, cell);

        if (map.tiles[index].sprite == GROUND_TILE_SPRITE) {
            map.tiles[index].sprite = (uint8_t)map_choose_ground_tile_sprite(map.type, index, lcg_seed);
        }
    }

    // Bake front walls
    for (int index = 0; index < map.width * map.height; index++) {
        int previous = index - map.width;
        if (previous < 0) {
            continue;
        }
        if (map.tiles[previous].sprite == SPRITE_TILE_WALL_SOUTH_EDGE) {
            map.tiles[index].sprite = SPRITE_TILE_WALL_SOUTH_FRONT;
        } else if (map.tiles[previous].sprite == SPRITE_TILE_WALL_SW_CORNER) {
            map.tiles[index].sprite = SPRITE_TILE_WALL_SW_FRONT;
        } else if (map.tiles[previous].sprite == SPRITE_TILE_WALL_SE_CORNER) {
            map.tiles[index].sprite = SPRITE_TILE_WALL_SE_FRONT;
        }
    }

    // Bake ramps
    map_bake_stairs(map, raw_map);
}

void map_bake_stairs(Map& map, const RawMap* raw_map) {
    bool is_stair[MAP_TILE_SIZE_MAX * MAP_TILE_SIZE_MAX];
    memset(is_stair, 0, sizeof(is_stair));
    for (int index = 0; index < map.width * map.height; index++) {
        if (raw_map->data[index] == MAP_VALUE_STAIR) {
            is_stair[index] = true;
        }
    }

    for (int index = 0; index < map.width * map.height; index++) {
        if (!is_stair[index]) {
            continue;
        }

        const ivec2 stair_min = ivec2(index % map.width, index / map.width);
        ivec2 step_direction = ivec2(0, 0);
        const ivec2 possible_step_directions[2] = { ivec2(1, 0), ivec2(0, 1) };
        for (uint32_t direction_index = 0; direction_index < 2; direction_index++) {
            ivec2 neighbor = stair_min + possible_step_directions[direction_index];
            if (!map_is_cell_in_bounds(map, neighbor)) {
                continue;
            }
            if (raw_map->data[neighbor.x + (neighbor.y * map.width)] != MAP_VALUE_STAIR) {
                continue;
            }
            step_direction = possible_step_directions[direction_index];
            break;
        }

        // Stairs are assumed to be at least 2 cells, having 1 neighbor
        // If they don't have a neighbor, we'll just render them as tile_null
        if (step_direction == ivec2(0, 0)) {
            map.tiles[index].sprite = SPRITE_TILE_NULL;
            continue;
        }

        ivec2 current = stair_min + step_direction;
        while (map_is_cell_in_bounds(map, current) &&
                    raw_map->data[current.x + (current.y * map.width)] == MAP_VALUE_STAIR) {
            current += step_direction;
        }
        // Step back one since that while loop would have moved us beyond the stair max
        const ivec2 stair_max = current - step_direction;

        Tile stair_min_tile = map_get_tile(map, stair_min);
        Direction stair_direction = map_get_tile_stair_direction(stair_min_tile);

        // If the stair direction is bad, it means this stair is not placed properly on a wall
        if (stair_direction == DIRECTION_COUNT) {
            map.tiles[index].sprite = SPRITE_TILE_NULL;
            continue;
        }
        map_bake_stair(map, stair_direction, stair_min, stair_max);

        // Mark stairs as no longer a ramp so that we only use these cells once
        for (ivec2 cell = stair_min; cell != stair_max + step_direction; cell += step_direction) {
            is_stair[cell.x + (cell.y * map.width)] = false;
        }
    }
}

void map_bake_stair(Map& map, Direction stair_direction, ivec2 stair_min, ivec2 stair_max) {
    ivec2 step_direction = stair_max - stair_min;
    if (step_direction.x != 0) {
        step_direction.x /= std::abs(step_direction.x);
    }
    if (step_direction.y != 0) {
        step_direction.y /= std::abs(step_direction.y);
    }
    for (ivec2 cell = stair_min; cell != stair_max + step_direction; cell += step_direction) {
        SpriteName stair_tile = SPRITE_TILE_NULL;
        if (stair_direction == DIRECTION_NORTH) {
            if (cell == stair_min) {
                stair_tile = SPRITE_TILE_WALL_NORTH_STAIR_LEFT;
            } else if (cell == stair_max) {
                stair_tile = SPRITE_TILE_WALL_NORTH_STAIR_RIGHT;
            } else {
                stair_tile = SPRITE_TILE_WALL_NORTH_STAIR_CENTER;
            }
        } else if (stair_direction == DIRECTION_EAST) {
            if (cell == stair_min) {
                stair_tile = SPRITE_TILE_WALL_EAST_STAIR_TOP;
            } else if (cell == stair_max) {
                stair_tile = SPRITE_TILE_WALL_EAST_STAIR_BOTTOM;
            } else {
                stair_tile = SPRITE_TILE_WALL_EAST_STAIR_CENTER;
            }
        } else if (stair_direction == DIRECTION_WEST) {
            if (cell == stair_min) {
                stair_tile = SPRITE_TILE_WALL_WEST_STAIR_TOP;
            } else if (cell == stair_max) {
                stair_tile = SPRITE_TILE_WALL_WEST_STAIR_BOTTOM;
            } else {
                stair_tile = SPRITE_TILE_WALL_WEST_STAIR_CENTER;
            }
        } else if (stair_direction == DIRECTION_SOUTH) {
            if (cell == stair_min) {
                stair_tile = SPRITE_TILE_WALL_SOUTH_STAIR_LEFT;
            } else if (cell == stair_max) {
                stair_tile = SPRITE_TILE_WALL_SOUTH_STAIR_RIGHT;
            } else {
                stair_tile = SPRITE_TILE_WALL_SOUTH_STAIR_CENTER;
            }
        }

        ivec2 stair_front_cell = cell + DIRECTION_IVEC2[stair_direction];
        if (stair_direction == DIRECTION_SOUTH) {
            stair_front_cell += DIRECTION_IVEC2[stair_direction];
        }
        if (!map_is_cell_in_bounds(map, stair_front_cell)) {
            continue;
        }
        if (!map_is_tile_ground(map, stair_front_cell)) {
            continue;
        }

        map.tiles[cell.x + (cell.y * map.width)].sprite = stair_tile;
        SpriteName south_front_tile = SPRITE_TILE_NULL;
        if (stair_tile == SPRITE_TILE_WALL_SOUTH_STAIR_LEFT) {
            south_front_tile = SPRITE_TILE_WALL_SOUTH_STAIR_FRONT_LEFT;
        } else if (stair_tile == SPRITE_TILE_WALL_SOUTH_STAIR_RIGHT) {
            south_front_tile = SPRITE_TILE_WALL_SOUTH_STAIR_FRONT_RIGHT;
        } else if (stair_tile == SPRITE_TILE_WALL_SOUTH_STAIR_CENTER) {
            south_front_tile = SPRITE_TILE_WALL_SOUTH_STAIR_FRONT_CENTER;
        }
        if (south_front_tile != SPRITE_TILE_NULL) {
            map.tiles[cell.x + ((cell.y + 1) * map.width)].sprite = south_front_tile;
        }
    } // End for cell in ramp
}

void map_calculate_unreachable_cells(Map& map) {
    // Determine map "islands"
    std::vector<int> map_tile_islands = std::vector<int>(map.width * map.height, MAP_ISLAND_UNASSIGNED);
    std::vector<int> island_size;

    for (int index = 0; index < map.width * map.height; index++) {
        if (map.cells[CELL_LAYER_GROUND][index].type == CELL_UNREACHABLE) {
            map.cells[CELL_LAYER_GROUND][index].type = CELL_EMPTY;
        }
    }

    while (true) {
        // Set index equal to the index of the first unassigned tile in the array
        int index;
        for (index = 0; index < map.width * map.height; index++) {
            if (map_is_cell_blocked(map.cells[CELL_LAYER_GROUND][index])) {
                continue;
            }

            if (map_tile_islands[index] == MAP_ISLAND_UNASSIGNED) {
                break;
            }
        }
        if (index == map.width * map.height) {
            break; // island mapping is complete
        }

        // Determine the next island index
        int island_index = island_size.size();
        island_size.push_back(0);

        // Flood fill this island index so that every tile that is reachable from
        // the start tile (the tile determined by index) has the same island index
        std::vector<ivec2> frontier;
        frontier.push_back(ivec2(index % map.width, index / map.width));

        while (!frontier.empty()) {
            ivec2 next = frontier[0];
            frontier.erase(frontier.begin());

            if (!map_is_cell_in_bounds(map, next)) {
                continue;
            }
            Cell cell_value = map.cells[CELL_LAYER_GROUND][next.x + (next.y * map.width)];
            if (map_is_cell_blocked(cell_value)) {
                continue;
            }

            // skip this because we've already explored it
            if (map_tile_islands[next.x + (next.y * map.width)] != MAP_ISLAND_UNASSIGNED) {
                continue;
            }

            map_tile_islands[next.x + (next.y * map.width)] = island_index;
            island_size[island_index]++;

            for (int direction = 0; direction < DIRECTION_COUNT; direction += 2) {
                frontier.push_back(next + DIRECTION_IVEC2[direction]);
            }
        }
    }

    int main_island = 0;
    for (int island_index = 1; island_index < (int)island_size.size(); island_index++) {
        if (island_size[island_index] > island_size[main_island]) {
            main_island = island_index;
        }
    }

    // Everything that's not on the main "island" is considered blocked
    // This makes it so that we don't place any player spawns or gold at these locations
    for (int index = 0; index < map.width * map.height; index++) {
        if (map.cells[CELL_LAYER_GROUND][index].type == CELL_EMPTY && map_tile_islands[index] != main_island) {
            map.cells[CELL_LAYER_GROUND][index].type = CELL_UNREACHABLE;
        }
    }
}

void map_create_decoration_at_cell(Map& map, ivec2 cell, int* lcg_seed) {
    // Previously, this function called lcg_rand to get the decoration hframe
    // Since we're only simulating, we don't care about the hframe, but we still need to
    // spin the random number generator to remain deterministic
    lcg_rand(lcg_seed);

    map.cells[CELL_LAYER_GROUND][cell.x + (cell.y * map.width)] = (Cell) {
        .type = CELL_DECORATION,
        .decoration_hframe = 0,
    };
}

void map_init_regions(Map& map) {
    // Create map regions
    map.region_count = 0;
    for (int index = 0; index < map.width * map.height; index++) {
        map.regions[index] = MAP_REGION_UNASSIGNED;
    }
    for (int chunk_y = 0; chunk_y < map.height / MAP_REGION_CHUNK_SIZE; chunk_y++) {
        for (int chunk_x = 0; chunk_x < map.width / MAP_REGION_CHUNK_SIZE; chunk_x++) {
            for (int y = chunk_y * MAP_REGION_CHUNK_SIZE; y < (chunk_y + 1) * MAP_REGION_CHUNK_SIZE; y++) {
                for (int x = chunk_x * MAP_REGION_CHUNK_SIZE; x < (chunk_x + 1) * MAP_REGION_CHUNK_SIZE; x++) {
                    // Filter down to unblocked, unassigned cells
                    Cell map_cell = map_get_cell(map, CELL_LAYER_GROUND, ivec2(x, y));
                    if (map_cell.type == CELL_BLOCKED || map_cell.type == CELL_UNREACHABLE || map_cell.type == CELL_DECORATION ||
                            map_get_region(map, ivec2(x, y)) != MAP_REGION_UNASSIGNED) {
                        continue;
                    }

                    // Now we know that this cell should be in a region
                    // Flood fill to find all cells connected to this cell
                    // that are within the same chunk

                    std::vector<ivec2> frontier;
                    frontier.push_back(ivec2(x, y));
                    while (!frontier.empty()) {
                        ivec2 next = frontier.back();
                        frontier.pop_back();

                        map.regions[next.x + (next.y * map.width)] = map.region_count;

                        for (int direction = 0; direction < DIRECTION_COUNT; direction += 2) {
                            ivec2 child = next + DIRECTION_IVEC2[direction];
                            if (child.x < chunk_x || child.y < chunk_y ||
                                    child.x >= (chunk_x + 1) * MAP_REGION_CHUNK_SIZE || child.y >= (chunk_y + 1) * MAP_REGION_CHUNK_SIZE) {
                                continue;
                            }

                            Cell child_cell = map_get_cell(map, CELL_LAYER_GROUND, child);
                            if (child_cell.type == CELL_BLOCKED || child_cell.type == CELL_UNREACHABLE || child_cell.type == CELL_DECORATION ||
                                    map_get_region(map, child) != MAP_REGION_UNASSIGNED) {
                                continue;
                            }
                            if (map_get_tile(map, child).elevation != map_get_tile(map, next).elevation) {
                                continue;
                            }

                            frontier.push_back(child);
                        }
                    } // end while not frontier empty

                    map.region_count++;
                }
            }
        }
    }

    // Create region connections
    map.region_connection_count = 0;
    for (uint32_t region = 0; region < map.region_count; region++) {
        for (uint32_t other_region = 0; other_region < map.region_count; other_region++) {
            map.region_connection_indices[region][other_region] = MAP_REGIONS_NOT_CONNECTED;
        }
    }
    for (int y = 0; y < map.height; y++) {
        for (int x = 0; x < map.width; x++) {
            int region = map_get_region(map, ivec2(x, y));
            if (region == MAP_REGION_UNASSIGNED) {
                continue;
            }

            for (int direction = 0; direction < DIRECTION_COUNT; direction += 2) {
                ivec2 neighbor = ivec2(x, y) + DIRECTION_IVEC2[direction];
                if (!map_is_cell_in_bounds(map, neighbor)) {
                    continue;
                }
                int neighbor_region = map_get_region(map, neighbor);
                if (neighbor_region == MAP_REGION_UNASSIGNED || neighbor_region == region) {
                    continue;
                }

                if (map.region_connection_indices[region][neighbor_region] == MAP_REGIONS_NOT_CONNECTED) {
                    MapRegionConnection new_connection;
                    memset(&new_connection, 0, sizeof(new_connection));
                    map.region_connections[map.region_connection_count] = new_connection;
                    map.region_connection_indices[region][neighbor_region] = (uint8_t)map.region_connection_count;
                    map.region_connection_count++;
                }
                uint8_t region_connection_index = map.region_connection_indices[region][neighbor_region];
                MapRegionConnection* connection = &map.region_connections[region_connection_index];
                connection->cells[connection->cell_count] = neighbor;
                connection->cell_count++;
            }
        }
    }

    // Calculate the center of each region connection
    ivec2 region_connection_centers[MAP_REGION_CONNECTION_MAX];
    for (uint32_t region_connection_index = 0; region_connection_index < map.region_connection_count; region_connection_index++) {
        const MapRegionConnection* region_connection = &map.region_connections[region_connection_index];

        // Caclulate the average of the cells in the connection
        ivec2 connection_average = ivec2(0, 0);
        for (uint32_t cell_index = 0; cell_index < region_connection->cell_count; cell_index++) {
            connection_average += region_connection->cells[cell_index];
        }
        connection_average = connection_average / region_connection->cell_count;

        // Choose the center, which is a cell among the connection that is closest to the average
        ivec2 connection_center = ivec2(-1, -1);
        for (uint32_t cell_index = 0; cell_index < region_connection->cell_count; cell_index++) {
            if (connection_center.x == -1 ||
                    ivec2::manhattan_distance(region_connection->cells[cell_index], connection_average) <
                    ivec2::manhattan_distance(connection_center, connection_average)) {
                connection_center = region_connection->cells[cell_index];
            }
        }
        region_connection_centers[region_connection_index] = connection_center;
    }

    // Calculate costs between region connections
    for (uint32_t connection_index = 0; connection_index < map.region_connection_count; connection_index++) {
        for (uint32_t other_index = 0; other_index < map.region_connection_count; other_index++) {
            map.region_connection_to_connection_cost[connection_index][other_index] = MAP_REGION_CONNECTIONS_NOT_CONNECTED;
        }
    }
    for (uint32_t region_connection_index = 0; region_connection_index < map.region_connection_count; region_connection_index++) {
        const MapRegionConnection* region_connection = &map.region_connections[region_connection_index];

        // Determine the region that this connection resides in
        // (this is the region that the connection leads to)
        int connection_region = map_get_region(map, region_connection->cells[0]);

        for (uint32_t other_region = 0; other_region < map.region_count; other_region++) {
            uint8_t other_connection_index = map.region_connection_indices[connection_region][other_region];
            if (other_connection_index == MAP_REGIONS_NOT_CONNECTED) {
                continue;
            }

            // If we have already computed this path one way, don't re-compute it
            if (map.region_connection_to_connection_cost[region_connection_index][other_connection_index] != MAP_REGION_CONNECTIONS_NOT_CONNECTED) {
                continue;
            }

            MapPath path;
            map_pathfind(map, CELL_LAYER_GROUND, region_connection_centers[region_connection_index], region_connection_centers[other_connection_index], 1, MAP_OPTION_NO_REGION_PATH, NULL, &path);
            map.region_connection_to_connection_cost[region_connection_index][other_connection_index] = (uint8_t)path.size();
            map.region_connection_to_connection_cost[other_connection_index][region_connection_index] = (uint8_t)path.size();
        }
    }
}

// BOUNDS

bool map_is_cell_in_bounds(const Map& map, ivec2 cell) {
    return !(cell.x < 0 || cell.y < 0 || cell.x >= map.width || cell.y >= map.height);
}

bool map_is_cell_rect_in_bounds(const Map& map, ivec2 cell, int size) {
    return !(cell.x < 0 || cell.y < 0 || cell.x + size > map.width || cell.y + size > (int)map.height);
}

ivec2 map_clamp_cell(const Map& map, ivec2 cell) {
    return ivec2(
        std::clamp(cell.x, 0, map.width),
        std::clamp(cell.y, 0, (int)map.height)
    );
}

// TILE

Tile map_get_tile(const Map& map, ivec2 cell) {
    return map.tiles[cell.x + (cell.y * map.width)];
}

bool map_is_tile_ground(const Map& map, ivec2 cell) {
    uint8_t tile_sprite = map.tiles[cell.x + (cell.y * map.width)].sprite;
    return (tile_sprite >= SPRITE_TILE_SAND1 && tile_sprite <= SPRITE_TILE_SAND3) ||
        (tile_sprite >= SPRITE_TILE_GRASS1 && tile_sprite <= SPRITE_TILE_GRASS5) ||
        (tile_sprite >= SPRITE_TILE_SNOW1 && tile_sprite <= SPRITE_TILE_SNOW3);
}

bool map_is_tile_ramp(const Map& map, ivec2 cell) {
    uint8_t tile_sprite = map.tiles[cell.x + (cell.y * map.width)].sprite;
    return tile_sprite >= SPRITE_TILE_WALL_SOUTH_STAIR_LEFT && tile_sprite <= SPRITE_TILE_WALL_WEST_STAIR_BOTTOM;
}

bool map_is_tile_water(const Map& map, ivec2 cell) {
    uint8_t tile_sprite = map.tiles[cell.x + (cell.y * map.width)].sprite;
    return tile_sprite == SPRITE_TILE_SAND_WATER ||
        tile_sprite == SPRITE_TILE_SNOW_WATER ||
        tile_sprite == SPRITE_TILE_GRASS_WATER;
}

// CELL

Cell map_get_cell(const Map& map, CellLayer layer, ivec2 cell) {
    return map.cells[layer][cell.x + (cell.y * map.width)];
}

void map_set_cell(Map& map, CellLayer layer, ivec2 cell, Cell value) {
    map.cells[layer][cell.x + (cell.y * map.width)] = value;
}

void map_set_cell_rect(Map& map, CellLayer layer, ivec2 cell, int size, Cell value) {
    for (int y = cell.y; y < cell.y + size; y++) {
        for (int x = cell.x; x < cell.x + size; x++) {
            map.cells[layer][x + (y * map.width)] = value;
        }
    }
}

bool map_is_cell_blocked(Cell cell) {
    return cell.type == CELL_BLOCKED ||
                cell.type == CELL_BUILDING ||
                cell.type == CELL_GOLDMINE ||
                cell.type == CELL_DECORATION;
}

bool map_is_cell_rect_blocked(const Map& map, ivec2 cell, int cell_size) {
    for (int y = cell.y; y < cell.y + cell_size; y++) {
        for (int x = cell.x; x < cell.x + cell_size; x++) {
            if (map_is_cell_blocked(map_get_cell(map, CELL_LAYER_GROUND, ivec2(x, y)))) {
                return true;
            }
        }
    }

    return false;
}

bool map_is_cell_rect_equal_to(const Map& map, CellLayer layer, ivec2 cell, int size, EntityId id) {
    for (int y = cell.y; y < cell.y + size; y++) {
        for (int x = cell.x; x < cell.x + size; x++) {
            if (map.cells[layer][x + (y * map.width)].id != id) {
                return false;
            }
        }
    }

    return true;
}

bool map_is_cell_rect_empty(const Map& map, CellLayer layer, ivec2 cell, int size) {
    for (int y = cell.y; y < cell.y + size; y++) {
        for (int x = cell.x; x < cell.x + size; x++) {
            if (map.cells[layer][x + (y * map.width)].type != CELL_EMPTY) {
                return false;
            }
        }
    }

    return true;
}

bool map_is_cell_rect_occupied(const Map& map, CellLayer layer, ivec2 cell, int size, ivec2 origin, uint32_t ignore) {
    EntityId origin_id = origin.x == -1 ? ID_NULL : map_get_cell(map, layer, origin).id;
    Rect origin_rect = (Rect) { .x = origin.x, .y = origin.y, .w = size, .h = size };
    bool ignore_units = (ignore & MAP_OPTION_IGNORE_UNITS) == MAP_OPTION_IGNORE_UNITS;
    bool ignore_miners = (ignore & MAP_OPTION_IGNORE_MINERS) == MAP_OPTION_IGNORE_MINERS;

    for (int y = cell.y; y < cell.y + size; y++) {
        for (int x = cell.x; x < cell.x + size; x++) {
            Cell map_cell = map_get_cell(map, layer, ivec2(x, y));
            // If the cell is empty or the cells is not empty but it is within the origin's rect, then it's not occupied
            if (map_cell.type == CELL_EMPTY || origin_rect.has_point(ivec2(x, y))) {
                continue;
            }
            // If cell is a miner and we are gold walking, then it is not blocked
            if (map_cell.type == CELL_MINER && ignore_miners) {
                continue;
            }
            // If cell is a unit and we are ignoring units, then it is not blocked
            if (map_cell.type == CELL_UNIT && ignore_units) {
                continue;
            }
            // If the cell is a unit that is far enough away from the origin, then it is not occupied
            // This allows units paths to ignore a unit ahead of them whose position may change
            if ((map_cell.type == CELL_UNIT || map_cell.type == CELL_MINER) && origin_id != ID_NULL
                    && ivec2::manhattan_distance(origin, ivec2(x, y)) > 5) {
                continue;
            }
            return true;
        }
    }

    return false;
}

bool map_is_cell_rect_same_elevation(const Map& map, ivec2 cell, int size) {
    for (int y = cell.y; y < cell.y + size; y++) {
        for (int x = cell.x; x < cell.x + size; x++) {
            if (map_get_tile(map, ivec2(x, y)).elevation != map_get_tile(map, cell).elevation) {
                return false;
            }
        }
    }

    return true;
}

// CELL FINDERS

// Returns the nearest cell around the rect relative to start_cell
// If there are no free cells around the rect in a radius of 1, then this returns the start cell
ivec2 map_get_nearest_cell_around_rect(const Map& map, CellLayer layer, ivec2 start, int start_size, ivec2 rect_position, int rect_size, uint32_t ignore, ivec2 ignore_cell) {
    ivec2 nearest_cell;
    int nearest_cell_dist = -1;

    ivec2 cell_begin[4] = {
        rect_position + ivec2(-start_size, -(start_size - 1)),
        rect_position + ivec2(-(start_size - 1), rect_size),
        rect_position + ivec2(rect_size, rect_size - 1),
        rect_position + ivec2(rect_size - 1, -start_size)
    };
    ivec2 cell_end[4] = {
        ivec2(cell_begin[0].x, rect_position.y + rect_size - 1),
        ivec2(rect_position.x + rect_size - 1, cell_begin[1].y),
        ivec2(cell_begin[2].x, cell_begin[0].y),
        ivec2(cell_begin[0].x + 1, cell_begin[3].y)
    };
    ivec2 cell_step[4] = { ivec2(0, 1), ivec2(1, 0), ivec2(0, -1), ivec2(-1, 0) };
    uint32_t index = 0;
    ivec2 cell = cell_begin[index];
    while (index < 4) {
        if (map_is_cell_rect_in_bounds(map, cell, start_size) && cell != ignore_cell) {
            if (!map_is_cell_rect_occupied(map, layer, cell, start_size, ivec2(-1, -1), ignore) && (nearest_cell_dist == -1 || ivec2::manhattan_distance(start, cell) < nearest_cell_dist)) {
                nearest_cell = cell;
                nearest_cell_dist = ivec2::manhattan_distance(start, cell);
            }
        }

        if (cell == cell_end[index]) {
            index++;
            if (index < 4) {
                cell = cell_begin[index];
            }
        } else {
            cell += cell_step[index];
        }
    }

    return nearest_cell_dist != -1 ? nearest_cell : start;
}

ivec2 map_get_exit_cell(const Map& map, CellLayer layer, ivec2 building_cell, int building_size, int unit_size, ivec2 rally_cell, uint32_t ignore, ivec2 ignore_cell) {
    ivec2 exit_cell = ivec2(-1, -1);
    int exit_cell_dist = -1;
    for (int x = building_cell.x - unit_size; x < building_cell.x + building_size + unit_size; x++) {
        ivec2 cell = ivec2(x, building_cell.y - unit_size);
        int cell_dist = ivec2::manhattan_distance(cell, rally_cell);
        if (map_is_cell_rect_in_bounds(map, cell, unit_size) &&
                !map_is_cell_rect_occupied(map, layer, cell, unit_size, ivec2(-1, -1), ignore) &&
                cell != ignore_cell &&
                (exit_cell_dist == -1 || cell_dist < exit_cell_dist)) {
            exit_cell = cell;
            exit_cell_dist = cell_dist;
        }
        cell = ivec2(x, building_cell.y + building_size);
        cell_dist = ivec2::manhattan_distance(cell, rally_cell);
        if (map_is_cell_rect_in_bounds(map, cell, unit_size) &&
                !map_is_cell_rect_occupied(map, layer, cell, unit_size, ivec2(-1, -1), ignore) &&
                cell != ignore_cell &&
                (exit_cell_dist == -1 || cell_dist < exit_cell_dist)) {
            exit_cell = cell;
            exit_cell_dist = cell_dist;
        }
    }
    for (int y = building_cell.y - unit_size; y < building_cell.y + building_size + unit_size; y++) {
        ivec2 cell = ivec2(building_cell.x - unit_size, y);
        int cell_dist = ivec2::manhattan_distance(cell, rally_cell);
        if (map_is_cell_rect_in_bounds(map, cell, unit_size) &&
                !map_is_cell_rect_occupied(map, layer, cell, unit_size, ivec2(-1, -1), ignore) &&
                cell != ignore_cell &&
                (exit_cell_dist == -1 || cell_dist < exit_cell_dist)) {
            exit_cell = cell;
            exit_cell_dist = cell_dist;
        }
        cell = ivec2(building_cell.x + building_size, y);
        cell_dist = ivec2::manhattan_distance(cell, rally_cell);
        if (map_is_cell_rect_in_bounds(map, cell, unit_size) &&
                !map_is_cell_rect_occupied(map, layer, cell, unit_size, ivec2(-1, -1), ignore) &&
                cell != ignore_cell &&
                (exit_cell_dist == -1 || cell_dist < exit_cell_dist)) {
            exit_cell = cell;
            exit_cell_dist = cell_dist;
        }
    }

    return exit_cell;
}

// REGIONS

uint8_t map_get_region(const Map& map, ivec2 cell) {
    return map.regions[cell.x + (cell.y * map.width)];
}

bool map_are_regions_connected(const Map& map, uint8_t region_a, uint8_t region_b) {
    return map.region_connection_indices[region_a][region_b] != MAP_REGIONS_NOT_CONNECTED;
}

// PATHFINDING

ivec2 map_pathfind_correct_target(const Map& map, CellLayer layer, ivec2 from, ivec2 to, uint32_t ignore, const MapPath* ignore_cells) {
    if (from == to) {
        return to;
    }

    std::vector<MapPathNode> frontier;
    std::vector<MapPathNode> explored;
    std::vector<int> explored_indices = std::vector<int>(map.width * map.height, -1);

    if (ignore_cells != NULL) {
        for (uint32_t ignore_cell_index = 0; ignore_cell_index < ignore_cells->size(); ignore_cell_index++) {
            ivec2 cell = (*ignore_cells)[ignore_cell_index];
            explored_indices[cell.x + (cell.y * map.width)] = 1;
        }
    }

    Cell cell = map_get_cell(map, layer, to);
    if (!(map_is_cell_blocked(cell) || cell.type == CELL_UNREACHABLE || cell.type == CELL_UNIT)) {
        // Target is reachable, so don't reverse pathfind
        return to;
    }

    // Reverse pathfind to find the nearest reachable cell
    frontier.push_back((MapPathNode) {
        .parent = -1,
        .cell = to,
        .cost = 0
    });

    while (!frontier.empty()) {
        // Find the smallest path
        uint32_t smallest_index = 0;
        for (uint32_t i = 1; i < frontier.size(); i++) {
            if (ivec2::manhattan_distance(frontier[i].cell, from) <
                    ivec2::manhattan_distance(frontier[smallest_index].cell, from)) {
                smallest_index = i;
            }
        }

        // Pop the smallest path
        MapPathNode smallest = frontier[smallest_index];
        frontier[smallest_index] = frontier.back();
        frontier.pop_back();

        // If it's the solution, return it
        if (smallest.cell == from) {
            return smallest.cell;
        }
        if (!map_is_cell_rect_occupied(map, layer, smallest.cell, 1, from, ignore)) {
            return smallest.cell;
        }

        // Otherwise mark this cell as explored
        explored_indices[smallest.cell.x + (smallest.cell.y * map.width)] = 1;

        // Consider all children
        for (int direction = 0; direction < DIRECTION_COUNT; direction++) {
            MapPathNode child = (MapPathNode) {
                .parent = -1,
                .cell = smallest.cell + DIRECTION_IVEC2[direction],
                .cost = 0
            };

            // Don't consider out of bounds children
            if (!map_is_cell_rect_in_bounds(map, child.cell, 1)) {
                continue;
            }

            // Don't consider explored indices
            if (explored_indices[child.cell.x + (child.cell.y * map.width)] != -1) {
                continue;
            }

            // Check if it's in the frontier
            uint32_t frontier_index;
            for (frontier_index = 0; frontier_index < frontier.size(); frontier_index++) {
                MapPathNode& frontier_node = frontier[frontier_index];
                if (frontier_node.cell == child.cell) {
                    break;
                }
            }
            // If it's in the frontier...
            if (frontier_index < frontier.size()) {
                // ...and the child represents a shorter version of the frontier path, then replace the frontier version with the shorter child
                if (ivec2::manhattan_distance(child.cell, from) <
                        ivec2::manhattan_distance(frontier[frontier_index].cell, from)) {
                    frontier[frontier_index] = child;
                }
                continue;
            }
            // If it's not in the frontier, then add it
            frontier.push_back(child);
        } // End for each child / direction
    } // End while frontier not empty

    return to;
}

ivec2 map_get_region_connection_cell_closest_to_cell(const Map& map, ivec2 cell, int cell_size, ivec2 to, int to_region) {
    int from_region = map_get_region(map, cell);

    uint8_t connection_index = map.region_connection_indices[from_region][to_region];
    const MapRegionConnection& connection = map.region_connections[connection_index];

    ivec2 nearest_connection_cell = ivec2(-1, -1);
    for (uint32_t cell_index = 0; cell_index < connection.cell_count; cell_index++) {
        ivec2 connection_cell = connection.cells[cell_index];
        if (map_is_cell_rect_occupied(map, CELL_LAYER_GROUND, connection_cell, cell_size, ivec2(-1, -1), MAP_OPTION_IGNORE_MINERS | MAP_OPTION_IGNORE_UNITS)) {
            continue;
        }

        if (nearest_connection_cell.x == -1 ||
                ivec2::manhattan_distance(connection_cell, cell) + ivec2::manhattan_distance(connection_cell, to) <
                ivec2::manhattan_distance(nearest_connection_cell, cell) + ivec2::manhattan_distance(nearest_connection_cell, to)) {
            nearest_connection_cell = connection.cells[cell_index];
        }
    }

    return nearest_connection_cell;
}

std::vector<int> map_get_region_path(const Map& map, ivec2 from, int cell_size, ivec2 to) {
    std::vector<int> path;

    if (map_get_region(map, from) == map_get_region(map, to)) {
        path.push_back(map_get_region(map, to));
        return path;
    }

    std::vector<MapRegionPathNode> frontier;
    std::vector<MapRegionPathNode> explored;
    std::vector<bool> is_region_explored(map.region_count, false);

    frontier.push_back((MapRegionPathNode) {
        .parent = -1,
        .cell = from,
        .connection_index = -1,
        .cost = 0
    });

    MapRegionPathNode end_node;
    end_node.cost = -1;
    while (!frontier.empty()) {
        uint32_t smallest_index = 0;
        for (uint32_t index = 1; index < frontier.size(); index++) {
            if (frontier[index].cost < frontier[smallest_index].cost) {
                smallest_index = index;
            }
        }
        MapRegionPathNode smallest = frontier[smallest_index];
        frontier[smallest_index] = frontier.back();
        frontier.pop_back();

        if (smallest.cell == to) {
            end_node = smallest.parent != -1 &&
                map_get_region(map, explored[smallest.parent].cell) ==
                map_get_region(map, smallest.cell)
                    ? explored[smallest.parent]
                    : smallest;
            break;
        }

        explored.push_back(smallest);
        is_region_explored[map_get_region(map, smallest.cell)] = true;

        if (map_get_region(map, smallest.cell) == map_get_region(map, to)) {
            MapRegionPathNode child = (MapRegionPathNode) {
                .parent = (int)explored.size() - 1,
                .cell = to,
                .connection_index = -1,
                .cost = smallest.cost + ivec2::manhattan_distance(smallest.cell, to)
            };

            uint32_t frontier_index;
            for (frontier_index = 0; frontier_index < frontier.size(); frontier_index++) {
                if (frontier[frontier_index].cell == child.cell) {
                    if (child.cost < frontier[frontier_index].cost) {
                        frontier[frontier_index] = child;
                    }
                    break;
                }
            }
            if (frontier_index == frontier.size()) {
                frontier.push_back(child);
            }
        }
        for (uint8_t connected_region = 0; connected_region < (uint8_t)map.region_count; connected_region++) {
            // Skip this region if it is already explored
            if (is_region_explored[connected_region]) {
                continue;
            }

            // Skip this region if it is not connected to the smallest node's region
            uint8_t connection_index = map.region_connection_indices[map_get_region(map, smallest.cell)][connected_region];
            if (connection_index == MAP_REGIONS_NOT_CONNECTED) {
                continue;
            }

            // Determine the cell in the connection closest to the smallest node's cell
            ivec2 nearest_cell = map_get_region_connection_cell_closest_to_cell(map, smallest.cell, cell_size, to, connected_region);
            if (nearest_cell.x == -1) {
                continue;
            }

            // Determine the connection cost
            uint8_t connection_cost = smallest.connection_index == -1
                ? ivec2::manhattan_distance(smallest.cell, nearest_cell)
                : map.region_connection_to_connection_cost[smallest.connection_index][connection_index];

            MapRegionPathNode child = (MapRegionPathNode) {
                .parent = (int)explored.size() - 1,
                .cell = nearest_cell,
                .connection_index = connection_index,
                .cost = smallest.cost + connection_cost
            };

            uint32_t frontier_index;
            for (frontier_index = 0; frontier_index < frontier.size(); frontier_index++) {
                if (map_get_region(map, child.cell) == map_get_region(map, frontier[frontier_index].cell)) {
                    if (child.cost < frontier[frontier_index].cost) {
                        frontier[frontier_index] = child;
                    }
                    break;
                }
            }
            if (frontier_index < frontier.size()) {
                continue;
            }

            frontier.push_back(child);
        }
    } // End while not frontier empty

    // Assert that a path was found

    // Build region path
    MapRegionPathNode current = end_node;
    while (current.parent != -1) {
        path.push_back(map_get_region(map, current.cell));
        current = explored[current.parent];
    }

    return path;
}

void map_pathfind(const Map& map, CellLayer layer, ivec2 from, ivec2 to, int cell_size, uint32_t options, const MapPath* ignore_cells, MapPath* path) {
    static const int EXPLORED_INDEX_NOT_EXPLORED = -1;
    static const int EXPLORED_INDEX_IGNORE_CELL = -2;

    // Always clear the path because paths are grabbed from a pool
    // so they may contain garbage data that we don't want to re-use
    path->clear();

    // Don't bother pathing to the unit's cell
    if (from == to) {
        return;
    }

    // If pathing into unwalkable territory, correct target
    ivec2 original_to = to;
    to = map_pathfind_correct_target(map, layer, from, to, options, ignore_cells);
    bool allow_squirreling = (options & MAP_OPTION_ALLOW_PATH_SQUIRRELING) == MAP_OPTION_ALLOW_PATH_SQUIRRELING;
    if (to != original_to && ivec2::manhattan_distance(from, to) < 3 &&
            map_get_cell(map, layer, original_to).type == CELL_UNIT && !allow_squirreling) {
        return;
    }

    // Find an alternate cell for large units
    if (cell_size > 1 && map_is_cell_rect_occupied(map, layer, to, cell_size, from, options)) {
        ivec2 nearest_alternative;
        int nearest_alternative_distance = -1;
        for (int x = 0; x < cell_size; x++) {
            for (int y = 0; y < cell_size; y++) {
                if (x == 0 && y == 0) {
                    continue;
                }

                ivec2 alternative = to - ivec2(x, y);
                if (map_is_cell_rect_in_bounds(map, alternative, cell_size) &&
                    !map_is_cell_rect_occupied(map, layer, alternative, cell_size, from, options)) {
                    if (nearest_alternative_distance == -1 || ivec2::manhattan_distance(from, alternative) < nearest_alternative_distance) {
                        nearest_alternative = alternative;
                        nearest_alternative_distance = ivec2::manhattan_distance(from, alternative);
                    }
                }
            }
        }

        if (nearest_alternative_distance != -1) {
            to = nearest_alternative;
        }
    }

    std::vector<MapPathNode> frontier;
    std::vector<MapPathNode> explored;
    std::vector<int> explored_indices = std::vector<int>(map.width * map.height, EXPLORED_INDEX_NOT_EXPLORED);
    uint32_t closest_explored = 0;
    bool found_path = false;
    bool avoid_landmines = (options & MAP_OPTION_AVOID_LANDMINES) == MAP_OPTION_AVOID_LANDMINES;
    MapPathNode path_end;

    // Fill the ignore cells into explored indices array so that we can do a constant time lookup to see if a cell should be ignored
    if (ignore_cells != NULL) {
        for (uint32_t ignore_cell_index = 0; ignore_cell_index < ignore_cells->size(); ignore_cell_index++) {
            ivec2 ignore_cell = (*ignore_cells)[ignore_cell_index];
            explored_indices[ignore_cell.x + (ignore_cell.y * map.width)] = EXPLORED_INDEX_IGNORE_CELL;
        }
    }

    std::vector<int> region_path;
    ivec2 heuristic_cell;
    bool no_region_path = (options & MAP_OPTION_NO_REGION_PATH) == MAP_OPTION_NO_REGION_PATH;
    if (no_region_path || layer == CELL_LAYER_SKY || map_get_region(map, from) == map_get_region(map, to)) {
        heuristic_cell = to;
    } else {
        region_path = map_get_region_path(map, from, cell_size, to);
        heuristic_cell = map_get_region_connection_cell_closest_to_cell(map, from, cell_size, to, region_path.back());
        if (heuristic_cell.x == -1) {
            heuristic_cell = to;
        }
    }

    frontier.push_back((MapPathNode) {
        .parent = -1,
        .cell = from,
        .cost = 0
    });

    while (!frontier.empty()) {
        // Find the smallest path
        uint32_t smallest_index = 0;
        for (uint32_t i = 1; i < frontier.size(); i++) {
            if (frontier[i].score(heuristic_cell) < frontier[smallest_index].score(heuristic_cell)) {
                smallest_index = i;
            }
        }

        // Pop the smallest path
        MapPathNode smallest = frontier[smallest_index];
        frontier[smallest_index] = frontier.back();
        frontier.pop_back();

        // If it's the solution, return it
        if (smallest.cell == to) {
            found_path = true;
            path_end = smallest;
            break;
        }

        // Check if we hit the next region target
        if (region_path.size() > 1 && map_get_region(map, smallest.cell) == region_path.back()) {
            region_path.pop_back();
            if (region_path.back() == map_get_region(map, to)) {
                heuristic_cell = to;
            } else {
                heuristic_cell = map_get_region_connection_cell_closest_to_cell(map, smallest.cell, cell_size, to, region_path.back());
                if (heuristic_cell.x == -1) {
                    heuristic_cell = to;
                }
            }

            // Clear the frontier once we get to a new region.
            // This helps ensure path completion on long, roundabout paths
            // by making it so that we prioritize new cells in the new region
            // instead of old cells from earlier in the pathing process.
            // It also means we can get away with less frontier comparisons.
            frontier.clear();
        // If we've reached the region of the to cell, then clear the region path and just path directly to our final target.
        // This helps handle special cases where sometimes we pathfind into our target region on the way to an intermediate region.
        // In these cases, the pathfinding was taking the unit all the way to the intermediate region and then doubling back to the
        // target region. This logic prevents the doubling back and lets us path straight to our goal.
        } else if (region_path.size() > 1 && map_get_region(map, smallest.cell) == map_get_region(map, to)) {
            region_path.clear();
            heuristic_cell = to;
            frontier.clear();
        }

        // Otherwise, add this tile to the explored list
        explored.push_back(smallest);
        explored_indices[smallest.cell.x + (smallest.cell.y * map.width)] = (int)explored.size() - 1;
        if (ivec2::manhattan_distance(explored.back().cell, heuristic_cell) < ivec2::manhattan_distance(explored[closest_explored].cell, heuristic_cell)) {
            closest_explored = (int)explored.size() - 1;
        }

        if (explored.size() > PATHFIND_ITERATION_MAX) {
            break;
        }

        // Consider all children
        // Adjacent cells are considered first so that we can use information about them to inform whether or not a diagonal movement is allowed
        bool is_adjacent_direction_blocked[4] = { true, true, true, true };
        const int CHILD_DIRECTIONS[DIRECTION_COUNT] = { DIRECTION_NORTH, DIRECTION_EAST, DIRECTION_SOUTH, DIRECTION_WEST,
                                                        DIRECTION_NORTHEAST, DIRECTION_SOUTHEAST, DIRECTION_SOUTHWEST, DIRECTION_NORTHWEST };
        for (int direction_index = 0; direction_index < DIRECTION_COUNT; direction_index++) {
            int direction = CHILD_DIRECTIONS[direction_index];
            MapPathNode child = (MapPathNode) {
                .parent = (int)explored.size() - 1,
                .cell = smallest.cell + DIRECTION_IVEC2[direction],
                .cost = smallest.cost + (direction % 2 == 1 ? 3 : 2)
            };

            // Don't consider out of bounds children
            if (!map_is_cell_rect_in_bounds(map, child.cell, cell_size)) {
                continue;
            }

            // Skip occupied cells (unless the child is the goal. this avoids worst-case pathing)
            if (map_is_cell_rect_occupied(map, layer, child.cell, cell_size, from, options) &&
                !(child.cell == to && ivec2::manhattan_distance(smallest.cell, child.cell) == 1)) {
                continue;
            }

            // If set in options, skip cells that are too close to landmines
            if (avoid_landmines) {
                bool is_cell_too_close_to_landmine = false;
                for (int y = child.cell.y - 1; y < child.cell.y + 2; y++) {
                    for (int x = child.cell.x - 1; x < child.cell.x + 2; x++) {
                        ivec2 cell = ivec2(x, y);
                        if (!map_is_cell_in_bounds(map, cell)) {
                            continue;
                        }

                        Cell map_underground_cell = map_get_cell(map, CELL_LAYER_UNDERGROUND, cell);
                        if (map_underground_cell.type == CELL_BUILDING) {
                            is_cell_too_close_to_landmine = true;
                        }
                    }
                }
                if (is_cell_too_close_to_landmine) {
                    continue;
                }
            }

            // Don't allow diagonal movement through cracks
            if (direction % 2 == 0) {
                is_adjacent_direction_blocked[direction / 2] = false;
            } else {
                int next_direction = direction + 1 == DIRECTION_COUNT ? 0 : direction + 1;
                int prev_direction = direction - 1;
                if (is_adjacent_direction_blocked[next_direction / 2] && is_adjacent_direction_blocked[prev_direction / 2]) {
                    continue;
                }
            }

            // Don't consider already explored children
            if (explored_indices[child.cell.x + (child.cell.y * map.width)] != EXPLORED_INDEX_NOT_EXPLORED) {
                continue;
            }

            uint32_t frontier_index;
            for (frontier_index = 0; frontier_index < frontier.size(); frontier_index++) {
                MapPathNode& frontier_node = frontier[frontier_index];
                if (frontier_node.cell == child.cell) {
                    break;
                }
            }
            // If it is in the frontier...
            if (frontier_index < frontier.size()) {
                // ...and the child represents a shorter version of the frontier path, then replace the frontier version with the shorter child
                if (child.score(heuristic_cell) < frontier[frontier_index].score(heuristic_cell)) {
                    frontier[frontier_index] = child;
                }
                continue;
            }
            // If it's not in the frontier, then add it to the frontier
            frontier.push_back(child);
        } // End for each child
    } // End while not frontier empty

    // Backtrack to build the path
    MapPathNode current = found_path ? path_end : explored[closest_explored];
    std::vector<ivec2> full_path;
    full_path.reserve(current.cost + 1);
    while (current.parent != -1) {
        full_path.push_back(current.cell);
        current = explored[current.parent];
    }

    // Since the full_path was formed by backtracking, it is in reverse order
    // we want to keep it in reverse order because pop_back() is fast
    // but the full_path might be larger than path->capacity(), so we take a
    // tail subslice of the full_path

    const uint32_t full_path_start_index =
        full_path.size() > path->capacity()
            ? full_path.size() - path->capacity()
            : 0;

    // path->clear() is caused at the start of the function
    for (uint32_t full_path_index = full_path_start_index; full_path_index < full_path.size(); full_path_index++) {
        path->push_back(full_path[full_path_index]);
    }
}

// This returns the hall cell that exiting miners walk toward
ivec2 map_get_ideal_mine_exit_path_rally_cell(const Map& map, ivec2 mine_cell, ivec2 hall_cell) {
    return map_get_nearest_cell_around_rect(map, CELL_LAYER_GROUND, mine_cell + ivec2(1, 1), 1, hall_cell, 4, MAP_OPTION_IGNORE_MINERS);
}

void map_get_ideal_mine_exit_path(const Map& map, ivec2 mine_cell, ivec2 hall_cell, MapPath* path) {
    ivec2 rally_cell = map_get_ideal_mine_exit_path_rally_cell(map, mine_cell, hall_cell);
    ivec2 mine_exit_cell = map_get_exit_cell(map, CELL_LAYER_GROUND, mine_cell, 3, 1, rally_cell, MAP_OPTION_IGNORE_MINERS);

    if (mine_exit_cell.x == -1) {
        path->clear();
        return;
    }

    map_pathfind(map, CELL_LAYER_GROUND, mine_exit_cell, rally_cell, 1, MAP_OPTION_IGNORE_MINERS | MAP_OPTION_NO_REGION_PATH, NULL, path);
    if (path->size() < path->capacity()) {
        path->push_back(mine_exit_cell);
    }
}

ivec2 map_get_ideal_mine_entrance_cell(const Map& map, ivec2 mine_cell, ivec2 hall_cell) {
    ivec2 start_cell = map_get_ideal_mine_exit_path_rally_cell(map, mine_cell, hall_cell);
    ivec2 mine_exit_cell = map_get_exit_cell(map, CELL_LAYER_GROUND, mine_cell, 3, 1, start_cell, MAP_OPTION_IGNORE_MINERS);
    return map_get_nearest_cell_around_rect(map, CELL_LAYER_GROUND, start_cell, 1, mine_cell, 3, MAP_OPTION_IGNORE_MINERS, mine_exit_cell);
}

void map_get_ideal_mine_entrance_path(const Map& map, ivec2 mine_cell, ivec2 hall_cell, MapPath* path) {
    MapPath mine_exit_path;
    map_get_ideal_mine_exit_path(map, mine_cell, hall_cell, &mine_exit_path);

    if (mine_exit_path.empty()) {
        path->clear();
        return;
    }

    ivec2 start_cell = map_get_ideal_mine_exit_path_rally_cell(map, mine_cell, hall_cell);
    ivec2 mine_exit_cell = map_get_exit_cell(map, CELL_LAYER_GROUND, mine_cell, 3, 1, start_cell, MAP_OPTION_IGNORE_MINERS);
    ivec2 mine_entrance_cell = map_get_nearest_cell_around_rect(map, CELL_LAYER_GROUND, start_cell, 1, mine_cell, 3, MAP_OPTION_IGNORE_MINERS, mine_exit_cell);

    map_pathfind(map, CELL_LAYER_GROUND, start_cell, mine_entrance_cell, 1, MAP_OPTION_IGNORE_MINERS | MAP_OPTION_NO_REGION_PATH, &mine_exit_path, path);
}
