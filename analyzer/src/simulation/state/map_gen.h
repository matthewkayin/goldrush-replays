#pragma once

#include "simulation/util/math.h"
#include "simulation/shared/match_setting.h"
#include "simulation/render/sprite.h"
#include "simulation/util/memread.h"
#include <cstdint>

const uint32_t MAP_TILE_SIZE_SMALL = 96U;
const uint32_t MAP_TILE_SIZE_MEDIUM = 128U;
const uint32_t MAP_TILE_SIZE_LARGE = 160U;
#define MAP_TILE_SIZE_MAX MAP_TILE_SIZE_LARGE

const uint8_t MAP_VALUE_WATER = 0;
const uint8_t MAP_VALUE_LOWGROUND = 1;
const uint8_t MAP_VALUE_HIGHGROUND = 2;
const uint8_t MAP_VALUE_STAIR = 3;
const uint8_t MAP_VALUE_GOLDMINE_LOWGROUND = 4;
const uint8_t MAP_VALUE_GOLDMINE_HIGHGROUND = 5;
const uint8_t MAP_VALUE_DECORATION_LOWGROUND = 6;
const uint8_t MAP_VALUE_DECORATION_HIGHGROUND = 7;

const uint32_t MAP_GEN_OPTION_SAVE_GOLDMINES = 1U;
const uint32_t MAP_GEN_OPTION_INVERT_MAP = 1U << 1U;
const uint32_t MAP_GEN_OPTION_GENERATE_DECORATIONS = 1U << 2U;

struct Tile {
    uint8_t sprite;
    uint8_t frame_x;
    uint8_t frame_y;
    uint8_t elevation;
};

struct RawMapIslandInfo {
    std::vector<uint32_t> island_of;
    std::vector<Rect> island_bounding_rects;
    std::vector<uint8_t> island_map_value;
};

struct PoissonDiskParams {
    int map_width;
    int map_height;
    int avoid_value[MAP_TILE_SIZE_MAX * MAP_TILE_SIZE_MAX];
    int disk_radius;
    int* lcg_seed;
};

struct RawMap {
    int width;
    int height;
    uint8_t data[MAP_TILE_SIZE_MAX * MAP_TILE_SIZE_MAX];
};

// Raw map
void raw_map_init(RawMap* raw_map, int width, int height);
void raw_map_generate(RawMap* raw_map, MapType map_type, int width, int height, int lcg_seed, uint32_t options);
bool raw_map_is_cell_in_bounds(const RawMap* raw_map, ivec2 cell);
bool raw_map_is_cell_rect_in_bounds(const RawMap* raw_map, ivec2 cell, int cell_size);
void raw_map_generate_terrain(RawMap* raw_map, const std::vector<ivec2>& goldmines, int* lcg_seed);
void raw_map_smooth_with_cellular_automata(RawMap* raw_map, uint32_t iterations);
RawMapIslandInfo raw_map_get_island_info(const RawMap* raw_map);
std::vector<uint8_t> raw_map_get_tile_types(const RawMap* raw_map);
bool raw_map_is_cell_rect_equal_to_tile_type(const RawMap* raw_map, const std::vector<uint8_t>& tile_types, ivec2 cell, int cell_size, uint8_t tile_type);
void raw_map_remove_narrow_canyons(RawMap* raw_map);
void raw_map_remove_small_lowground(RawMap* raw_map);
void raw_map_remove_lowground_nooks(RawMap* raw_map);
void raw_map_remove_ugly_front_walls(RawMap* raw_map);
void raw_map_remove_narrow_bridges(RawMap* raw_map);
bool raw_map_remove_artifacts(RawMap* raw_map);
void raw_map_generate_water(RawMap* raw_map, const std::vector<ivec2>& goldmines, int* lcg_seed);
void raw_map_generate_stairs(RawMap* raw_map);
Tile raw_map_get_baked_tile_at_cell(const RawMap* raw_map, MapType map_type, ivec2 cell);
bool map_tile_is_south_wall(SpriteName sprite);
bool raw_map_can_stair_be_placed_at_cell(const RawMap* raw_map, ivec2 cell);

// Map size
int map_get_tile_size(MapSize value);
MapSize map_get_map_size_from_tile_size(int value);

// Goldmines
void raw_map_save_goldmines(RawMap* raw_map, const std::vector<ivec2>& goldmines);
ivec2 raw_map_get_player_goldmine_position(const RawMap* raw_map, uint32_t player_id);
ivec2 raw_map_get_goldmine_position(const RawMap* raw_map, const std::vector<ivec2>& goldmines, uint32_t goldmine_index);
std::vector<ivec2> raw_map_extract_goldmines(RawMap* raw_map);
std::vector<ivec2> map_generate_goldmines(int map_width, int map_height, int* lcg_seed);
uint32_t map_gen_get_number_of_goldmines_to_generate(MapSize map_size);

// Bake helpers
Direction map_get_tile_stair_direction(const Tile& tile);
SpriteName map_choose_ground_tile_sprite(MapType map_type, int index, int* lcg_seed);
SpriteName map_choose_water_tile_sprite(MapType map_type);
SpriteName map_get_plain_ground_tile_sprite(MapType map_type);
SpriteName map_get_decoration_sprite(MapType map_type);
SpriteName map_wall_autotile_lookup(uint32_t neighbors);
uint8_t map_neighbors_to_autotile_index(uint32_t p_neighbors);

// Decorations
void raw_map_generate_decorations(RawMap* raw_map, MapType map_type, int* lcg_seed);
void raw_map_save_decorations_cacti(RawMap* raw_map, const std::vector<ivec2>& decoration_cells);
void raw_map_save_decorations_trees(RawMap* raw_map, PoissonDiskParams* params, const std::vector<ivec2>& decoration_cells);
std::vector<ivec2> raw_map_get_decorations(const RawMap* raw_map);
std::vector<ivec2> raw_map_extract_decorations(RawMap* raw_map);

// Poisson disk
PoissonDiskParams* poisson_disk_params_init(int map_width, int map_height, int disk_radius, int* lcg_seed);
void poisson_disk_update_avoid_value(PoissonDiskParams* params, ivec2 position, int radius, int value);
void poisson_disk_avoid_cell(PoissonDiskParams* params, ivec2 position, int radius);
void poisson_disk_unavoid_cell(PoissonDiskParams* params, ivec2 position, int radius);
bool poisson_disk_should_avoid_cell(const PoissonDiskParams* params, ivec2 cell);
std::vector<ivec2> poisson_disk_get_circle_offset_points(int disk_radius);
bool poisson_disk_is_cell_valid(const PoissonDiskParams* params, ivec2 cell);
std::vector<ivec2> poisson_disk(PoissonDiskParams* params);

// Finalize
ivec2 raw_map_get_player_hall_location(const RawMap* raw_map, uint32_t player_id);
bool raw_map_is_player_spawn_valid(const RawMap* raw_map, uint32_t player_id);
bool raw_map_is_valid(const RawMap* raw_map);
bool raw_map_is_cell_open_for_2x2_units(const RawMap* raw_map, const std::vector<bool>& is_tile_blocked, ivec2 cell);

// File
void raw_map_fwrite(const RawMap* raw_map, FILE* file);
void raw_map_memread(RawMap* raw_map, MemCursor* cursor);
