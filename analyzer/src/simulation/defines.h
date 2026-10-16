#pragma once

#include <cstdint>

#define UPDATES_PER_SECOND 60
#define MAX_PLAYERS 4
#define PLAYER_NONE MAX_PLAYERS
#define TILE_SIZE 16
#define SELECTION_LIMIT 20U
#define MAX_USERNAME_LENGTH 32

typedef uint16_t EntityId;
const EntityId ID_MAX = 4096;
const EntityId ID_NULL = ID_MAX;
const uint32_t INDEX_INVALID = UINT16_MAX;

#define AUTOTILE_HFRAMES 8U
#define AUTOTILE_VFRAMES 8U
