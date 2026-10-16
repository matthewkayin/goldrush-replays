#pragma once

#include "simulation/defines.h"
#include "simulation/container/fixed_vector.h"
#include "simulation/util/math.h"
#include "simulation/state/map_gen.h"

#define MAP_REGION_MAX 128
#define MAP_REGION_CONNECTION_MAX 256
#define MAP_COST_TO_CONNECTION_MAX 16
#define MAP_REGION_CHUNK_SIZE 32

#define MAP_MAX_PATH_SIZE 64
using MapPath = FixedVector<ivec2, MAP_MAX_PATH_SIZE>;

const uint32_t MAP_OPTION_IGNORE_UNITS = 1;
const uint32_t MAP_OPTION_IGNORE_MINERS = 2;
const uint32_t MAP_OPTION_AVOID_LANDMINES = 1 << 2;
const uint32_t MAP_OPTION_ALLOW_PATH_SQUIRRELING = 1 << 3;
const uint32_t MAP_OPTION_NO_REGION_PATH = 1 << 4;

enum CellLayer {
    CELL_LAYER_UNDERGROUND,
    CELL_LAYER_GROUND,
    CELL_LAYER_SKY,
    CELL_LAYER_COUNT
};

enum CellType: uint16_t {
    CELL_EMPTY,
    CELL_BLOCKED,
    CELL_UNREACHABLE,
    CELL_DECORATION,
    CELL_UNIT,
    CELL_BUILDING,
    CELL_MINER,
    CELL_GOLDMINE
};

struct Cell {
    CellType type;
    union {
        EntityId id;
        uint16_t decoration_hframe;
    };
};

// The reason why the cells array has a size of MAP_REGION_CHUNK_SIZE
// is because each chunk is CHUNK_SIZE x CHUNK_SIZE big, which means
// the biggest possible connection is two totally flat regions side-by-side,
// their cells on one of the four sides of the region square are all lined up,
// so that's a connection that is MAP_REGION_CHUNK_SIZE big
struct MapRegionConnection {
    uint32_t cell_count;
    ivec2 cells[MAP_REGION_CHUNK_SIZE];
};

struct MapRegionPathNode {
    int parent;
    ivec2 cell;
    int connection_index;
    int cost;
};

struct MapPathNode {
    // The parent is the previous node stepped in the path to reach this node
    // It should be an index in the explored list or -1 if it is the start node
    int parent;
    ivec2 cell;
    int cost;
    int score(ivec2 target) const {
        // Cost is divided by 2 because the cost scale is larger than the distance scale
        // (this is so that we can weight diagonal movement more heavily than adjacent movement.
        // diagonal movement costs 1.5 which is saved as a cost of 3 and adjacent movement costs
        // 1 which is saved as a cost of 2 (3/2 vs 2/2).
        return (cost / 2) + ivec2::manhattan_distance(cell, target);
    }
};

struct Map {
    MapType type;
    int width;
    int height;
    Tile tiles[MAP_TILE_SIZE_MAX * MAP_TILE_SIZE_MAX];
    Cell cells[CELL_LAYER_COUNT][MAP_TILE_SIZE_MAX * MAP_TILE_SIZE_MAX];

    uint32_t region_count;
    uint8_t regions[MAP_TILE_SIZE_MAX * MAP_TILE_SIZE_MAX];
    uint8_t region_connection_indices[MAP_REGION_MAX][MAP_REGION_MAX];
    uint32_t region_connection_count;
    MapRegionConnection region_connections[MAP_REGION_CONNECTION_MAX];
    uint8_t region_connection_to_connection_cost[MAP_REGION_CONNECTION_MAX][MAP_REGION_CONNECTION_MAX];
};

void map_init(Map& map, MapType map_type, const RawMap* raw_map, int* lcg_seed);
void map_clear_cells(Map& map);
void map_block_walls_and_water(Map& map);
void map_bake(Map& map, const RawMap* raw_map, int* lcg_seed);
void map_bake_stairs(Map& map, const RawMap* raw_map);
void map_bake_stair(Map& map, Direction stair_direction, ivec2 stair_min, ivec2 stair_max);
void map_calculate_unreachable_cells(Map& map);
void map_create_decoration_at_cell(Map& map, ivec2 cell, int* lcg_seed);
void map_init_regions(Map& map);

// Bounds
bool map_is_cell_in_bounds(const Map& map, ivec2 cell);
bool map_is_cell_rect_in_bounds(const Map& map, ivec2 cell, int size);
ivec2 map_clamp_cell(const Map& map, ivec2 cell);

// Tile
Tile map_get_tile(const Map& map, ivec2 cell);
bool map_is_tile_ground(const Map& map, ivec2 cell);
bool map_is_tile_ramp(const Map& map, ivec2 cell);
bool map_is_tile_water(const Map& map, ivec2 cell);

// Cell
Cell map_get_cell(const Map& map, CellLayer layer, ivec2 cell);
void map_set_cell(Map& map, CellLayer layer, ivec2 cell, Cell value);
void map_set_cell_rect(Map& map, CellLayer layer, ivec2 cell, int size, Cell value);
bool map_is_cell_blocked(Cell cell);
bool map_is_cell_rect_blocked(const Map& map, ivec2 cell, int cell_size);
bool map_is_cell_rect_equal_to(const Map& map, CellLayer layer, ivec2 cell, int size, EntityId id);
bool map_is_cell_rect_empty(const Map& map, CellLayer layer, ivec2 cell, int size);
bool map_is_cell_rect_occupied(const Map& map, CellLayer layer, ivec2 cell, int size, ivec2 origin = ivec2(-1, -1), uint32_t ignore = 0);
bool map_is_cell_rect_same_elevation(const Map& map, ivec2 cell, int size);

// Cell finders
ivec2 map_get_nearest_cell_around_rect(const Map& map, CellLayer layer, ivec2 start, int start_size, ivec2 rect_position, int rect_size, uint32_t ignore = 0, ivec2 ignore_cell = ivec2(-1, -1));
ivec2 map_get_exit_cell(const Map& map, CellLayer layer, ivec2 building_cell, int building_size, int unit_size, ivec2 rally_cell, uint32_t ignore, ivec2 ignore_cell = ivec2(-1, -1));

// Regions
uint8_t map_get_region(const Map& map, ivec2 cell);
bool map_are_regions_connected(const Map& map, uint8_t region_a, uint8_t region_b);

// Pathfinding
void map_pathfind(const Map& map, CellLayer layer, ivec2 from, ivec2 to, int cell_size, uint32_t options, const MapPath* ignore_cells, MapPath* path);
ivec2 map_get_ideal_mine_exit_path_rally_cell(const Map& map, ivec2 mine_cell, ivec2 hall_cell);
void map_get_ideal_mine_exit_path(const Map& map, ivec2 mine_cell, ivec2 hall_cell, MapPath* path);
ivec2 map_get_ideal_mine_entrance_cell(const Map& map, ivec2 mine_cell, ivec2 hall_cell);
void map_get_ideal_mine_entrance_path(const Map& map, ivec2 mine_cell, ivec2 hall_cell, MapPath* path);
