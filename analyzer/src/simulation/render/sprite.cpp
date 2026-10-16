#include "sprite.h"

#include <unordered_map>

static const std::unordered_map<SpriteName, SpriteParams> SPRITE_PARAMS = {
    { SPRITE_TILE_NULL, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_ARIZONA,
            .type = TILE_TYPE_SINGLE,
            .source_x = 32,
            .source_y = 16
        }
    }},
    { SPRITE_TILE_SAND1, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_ARIZONA,
            .type = TILE_TYPE_SINGLE,
            .source_x = 0,
            .source_y = 0
        }
    }},
    { SPRITE_TILE_SAND2, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_ARIZONA,
            .type = TILE_TYPE_SINGLE,
            .source_x = 16,
            .source_y = 0
        }
    }},
    { SPRITE_TILE_SAND3, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_ARIZONA,
            .type = TILE_TYPE_SINGLE,
            .source_x = 32,
            .source_y = 0
        }
    }},
    { SPRITE_TILE_SAND_WATER, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_ARIZONA,
            .type = TILE_TYPE_AUTO,
            .source_x = 0,
            .source_y = 16
        }
    }},
    { SPRITE_TILE_SNOW1, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_KLONDIKE,
            .type = TILE_TYPE_SINGLE,
            .source_x = 0,
            .source_y = 0
        }
    }},
    { SPRITE_TILE_SNOW2, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_KLONDIKE,
            .type = TILE_TYPE_SINGLE,
            .source_x = 16,
            .source_y = 0
        }
    }},
    { SPRITE_TILE_SNOW3, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_KLONDIKE,
            .type = TILE_TYPE_SINGLE,
            .source_x = 32,
            .source_y = 0
        }
    }},
    { SPRITE_TILE_SNOW_WATER, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_KLONDIKE,
            .type = TILE_TYPE_AUTO,
            .source_x = 0,
            .source_y = 16
        }
    }},
    { SPRITE_TILE_WALL_NW_CORNER, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_ARIZONA,
            .type = TILE_TYPE_SINGLE,
            .source_x = 48,
            .source_y = 0
        }
    }},
    { SPRITE_TILE_GRASS1, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_BOULDER,
            .type = TILE_TYPE_SINGLE,
            .source_x = 0,
            .source_y = 0
        }
    }},
    { SPRITE_TILE_GRASS2, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_BOULDER,
            .type = TILE_TYPE_SINGLE,
            .source_x = 16,
            .source_y = 0
        }
    }},
    { SPRITE_TILE_GRASS3, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_BOULDER,
            .type = TILE_TYPE_SINGLE,
            .source_x = 32,
            .source_y = 0
        }
    }},
    { SPRITE_TILE_GRASS4, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_BOULDER,
            .type = TILE_TYPE_SINGLE,
            .source_x = 32,
            .source_y = 16
        }
    }},
    { SPRITE_TILE_GRASS5, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_BOULDER,
            .type = TILE_TYPE_SINGLE,
            .source_x = 32,
            .source_y = 32
        }
    }},
    { SPRITE_TILE_GRASS_WATER, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_BOULDER,
            .type = TILE_TYPE_AUTO,
            .source_x = 0,
            .source_y = 16
        }
    }},
    { SPRITE_TILE_WALL_NW_CORNER, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_ARIZONA,
            .type = TILE_TYPE_SINGLE,
            .source_x = 48,
            .source_y = 0
        }
    }},
    { SPRITE_TILE_WALL_NE_CORNER, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_ARIZONA,
            .type = TILE_TYPE_SINGLE,
            .source_x = 80,
            .source_y = 0
        }
    }},
    { SPRITE_TILE_WALL_SW_CORNER, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_ARIZONA,
            .type = TILE_TYPE_SINGLE,
            .source_x = 48,
            .source_y = 32
        }
    }},
    { SPRITE_TILE_WALL_SE_CORNER, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_ARIZONA,
            .type = TILE_TYPE_SINGLE,
            .source_x = 80,
            .source_y = 32
        }
    }},
    { SPRITE_TILE_WALL_NORTH_EDGE, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_ARIZONA,
            .type = TILE_TYPE_SINGLE,
            .source_x = 64,
            .source_y = 0
        }
    }},
    { SPRITE_TILE_WALL_WEST_EDGE, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_ARIZONA,
            .type = TILE_TYPE_SINGLE,
            .source_x = 48,
            .source_y = 16
        }
    }},
    { SPRITE_TILE_WALL_EAST_EDGE, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_ARIZONA,
            .type = TILE_TYPE_SINGLE,
            .source_x = 80,
            .source_y = 16
        }
    }},
    { SPRITE_TILE_WALL_SOUTH_EDGE, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_ARIZONA,
            .type = TILE_TYPE_SINGLE,
            .source_x = 64,
            .source_y = 32
        }
    }},
    { SPRITE_TILE_WALL_SE_FRONT, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_ARIZONA,
            .type = TILE_TYPE_SINGLE,
            .source_x = 80,
            .source_y = 48
        }
    }},
    { SPRITE_TILE_WALL_SOUTH_FRONT, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_ARIZONA,
            .type = TILE_TYPE_SINGLE,
            .source_x = 64,
            .source_y = 48
        }
    }},
    { SPRITE_TILE_WALL_SW_FRONT, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_ARIZONA,
            .type = TILE_TYPE_SINGLE,
            .source_x = 48,
            .source_y = 48
        }
    }},
    { SPRITE_TILE_WALL_NW_INNER_CORNER, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_ARIZONA,
            .type = TILE_TYPE_SINGLE,
            .source_x = 96,
            .source_y = 0
        }
    }},
    { SPRITE_TILE_WALL_NE_INNER_CORNER, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_ARIZONA,
            .type = TILE_TYPE_SINGLE,
            .source_x = 112,
            .source_y = 0
        }
    }},
    { SPRITE_TILE_WALL_SW_INNER_CORNER, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_ARIZONA,
            .type = TILE_TYPE_SINGLE,
            .source_x = 96,
            .source_y = 16
        }
    }},
    { SPRITE_TILE_WALL_SE_INNER_CORNER, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_ARIZONA,
            .type = TILE_TYPE_SINGLE,
            .source_x = 112,
            .source_y = 16
        }
    }},
    { SPRITE_TILE_WALL_SOUTH_STAIR_LEFT, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_ARIZONA,
            .type = TILE_TYPE_SINGLE,
            .source_x = 96,
            .source_y = 32
        }
    }},
    { SPRITE_TILE_WALL_SOUTH_STAIR_CENTER, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_ARIZONA,
            .type = TILE_TYPE_SINGLE,
            .source_x = 112,
            .source_y = 32
        }
    }},
    { SPRITE_TILE_WALL_SOUTH_STAIR_RIGHT, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_ARIZONA,
            .type = TILE_TYPE_SINGLE,
            .source_x = 128,
            .source_y = 32
        }
    }},
    { SPRITE_TILE_WALL_SOUTH_STAIR_FRONT_LEFT, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_ARIZONA,
            .type = TILE_TYPE_SINGLE,
            .source_x = 96,
            .source_y = 48
        }
    }},
    { SPRITE_TILE_WALL_SOUTH_STAIR_FRONT_CENTER, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_ARIZONA,
            .type = TILE_TYPE_SINGLE,
            .source_x = 112,
            .source_y = 48
        }
    }},
    { SPRITE_TILE_WALL_SOUTH_STAIR_FRONT_RIGHT, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_ARIZONA,
            .type = TILE_TYPE_SINGLE,
            .source_x = 128,
            .source_y = 48
        }
    }},
    { SPRITE_TILE_WALL_NORTH_STAIR_LEFT, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_ARIZONA,
            .type = TILE_TYPE_SINGLE,
            .source_x = 144,
            .source_y = 48
        }
    }},
    { SPRITE_TILE_WALL_NORTH_STAIR_CENTER, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_ARIZONA,
            .type = TILE_TYPE_SINGLE,
            .source_x = 160,
            .source_y = 48
        }
    }},
    { SPRITE_TILE_WALL_NORTH_STAIR_RIGHT, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_ARIZONA,
            .type = TILE_TYPE_SINGLE,
            .source_x = 176,
            .source_y = 48
        }
    }},
    { SPRITE_TILE_WALL_EAST_STAIR_TOP, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_ARIZONA,
            .type = TILE_TYPE_SINGLE,
            .source_x = 160,
            .source_y = 0
        }
    }},
    { SPRITE_TILE_WALL_EAST_STAIR_CENTER, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_ARIZONA,
            .type = TILE_TYPE_SINGLE,
            .source_x = 160,
            .source_y = 16
        }
    }},
    { SPRITE_TILE_WALL_EAST_STAIR_BOTTOM, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_ARIZONA,
            .type = TILE_TYPE_SINGLE,
            .source_x = 160,
            .source_y = 32
        }
    }},
    { SPRITE_TILE_WALL_WEST_STAIR_TOP, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_ARIZONA,
            .type = TILE_TYPE_SINGLE,
            .source_x = 144,
            .source_y = 0
        }
    }},
    { SPRITE_TILE_WALL_WEST_STAIR_CENTER, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_ARIZONA,
            .type = TILE_TYPE_SINGLE,
            .source_x = 144,
            .source_y = 16
        }
    }},
    { SPRITE_TILE_WALL_WEST_STAIR_BOTTOM, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_ARIZONA,
            .type = TILE_TYPE_SINGLE,
            .source_x = 144,
            .source_y = 32
        }
    }},
    { SPRITE_DECORATION_ARIZONA, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_DECORATIONS_ARIZONA,
            .hframes = 5,
            .vframes = 1
        }
    }},
    { SPRITE_DECORATION_KLONDIKE, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_DECORATIONS_KLONDIKE,
            .hframes = 4,
            .vframes = 1
        }
    }},
    { SPRITE_DECORATION_BOULDER, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_DECORATIONS_BOULDER,
            .hframes = 4,
            .vframes = 1
        }
    }},
    { SPRITE_FOG_HIDDEN, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_FOG,
            .type = TILE_TYPE_AUTO,
            .source_x = 0,
            .source_y = 0
        }
    }},
    { SPRITE_FOG_EXPLORED, (SpriteParams) {
        .strategy = SPRITE_IMPORT_TILE,
        .tile = {
            .tileset = TILESET_FOG,
            .type = TILE_TYPE_AUTO,
            .source_x = 32,
            .source_y = 0
        }
    }},
    { SPRITE_UI_MINIMAP, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_UI_MINIMAP,
            .hframes = 1,
            .vframes = 1
        }
    }},
    { SPRITE_UI_WANTED_SIGN, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_UI_WANTED_SIGN,
            .hframes = 1,
            .vframes = 1
        }
    }},
    { SPRITE_UI_FRAME_BOLTS, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_UI_FRAME_BOLTS,
            .hframes = 3,
            .vframes = 3
        }
    }},
    { SPRITE_UI_FRAME, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_UI_FRAME,
            .hframes = 3,
            .vframes = 3
        }
    }},
    { SPRITE_UI_FRAME_SMALL, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_UI_FRAME_SMALL,
            .hframes = 3,
            .vframes = 3
        }
    }},
    { SPRITE_UI_BUTTON_REFRESH, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_UI_BUTTON_REFRESH,
            .hframes = 2,
            .vframes = 1
        }
    }},
    { SPRITE_UI_BUTTON_ARROW, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_UI_BUTTON_ARROW,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_UI_BUTTON_BURGER, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_UI_BUTTON_BURGER,
            .hframes = 2,
            .vframes = 1
        }
    }},
    { SPRITE_UI_BUTTON_PROFILE, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_UI_BUTTON_PROFILE,
            .hframes = 2,
            .vframes = 1
        }
    }},
    { SPRITE_UI_REPLAY_PAUSE, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_UI_REPLAY_PAUSE,
            .hframes = 2,
            .vframes = 1
        }
    }},
    { SPRITE_UI_REPLAY_PLAY, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_UI_REPLAY_PLAY,
            .hframes = 2,
            .vframes = 1
        }
    }},
    { SPRITE_UI_EDITOR_PLUS, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_UI_EDITOR_PLUS,
            .hframes = 2,
            .vframes = 1
        }
    }},
    { SPRITE_UI_EDITOR_EDIT, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_UI_EDITOR_EDIT,
            .hframes = 2,
            .vframes = 1
        }
    }},
    { SPRITE_UI_EDITOR_TRASH, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_UI_EDITOR_TRASH,
            .hframes = 2,
            .vframes = 1
        }
    }},
    { SPRITE_UI_GOLD_ICON, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_UI_GOLD_ICON,
            .hframes = 1,
            .vframes = 1
        }
    }},
    { SPRITE_UI_HOUSE_ICON, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_UI_HOUSE_ICON,
            .hframes = 1,
            .vframes = 1
        }
    }},
    { SPRITE_UI_MINER_ICON, (SpriteParams) {
        .strategy = SPRITE_IMPORT_PLAYER_COLOR,
        .sheet = {
            .resource = RESOURCE_SPRITE_UI_MINER_ICON,
            .hframes = 1,
            .vframes = 1
        }
    }},
    { SPRITE_UI_ENERGY_ICON, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_UI_ENERGY_ICON,
            .hframes = 1,
            .vframes = 1
        }
    }},
    { SPRITE_UI_DROPDOWN, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_UI_DROPDOWN,
            .hframes = 1,
            .vframes = 5
        }
    }},
    { SPRITE_UI_DROPDOWN_MINI, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_UI_DROPDOWN_MINI,
            .hframes = 1,
            .vframes = 5
        }
    }},
    { SPRITE_UI_TEAM_PICKER, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_UI_TEAM_PICKER,
            .hframes = 2,
            .vframes = 1
        }
    }},
    { SPRITE_UI_MENU_BUTTON, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_UI_MENU_BUTTON,
            .hframes = 3,
            .vframes = 2
        }
    }},
    { SPRITE_UI_TEXT_FRAME, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_UI_TEXT_FRAME,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_UI_CLOUDS, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_UI_CLOUDS,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_UI_SWATCH, (SpriteParams) {
        .strategy = SPRITE_IMPORT_SWATCH,
    }},
    { SPRITE_UI_TITLE, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_UI_TITLE,
            .hframes = 1,
            .vframes = 1
        }
    }},
    { SPRITE_UI_MOVE, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_UI_MOVE,
            .hframes = 5,
            .vframes = 1
        }
    }},
    { SPRITE_UI_CONTROL_GROUP, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_UI_CONTROL_GROUP,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_UI_ICON_BUTTON, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_UI_ICON_BUTTON,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_UI_TOOLTIP_FRAME, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_UI_TOOLTIP_FRAME,
            .hframes = 3,
            .vframes = 3
        }
    }},
    { SPRITE_UI_STAT_ICON_DETECTION, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_UI_STAT_ICON_DETECTION,
            .hframes = 1,
            .vframes = 1
        }
    }},
    { SPRITE_UI_OBJECTIVE_CHECKBOX, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_UI_OBJECTIVE_CHECKBOX,
            .hframes = 2,
            .vframes = 1
        }
    }},
    { SPRITE_UI_CAMPAIGN_MAP, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_UI_CAMPAIGN_MAP,
            .hframes = 1,
            .vframes = 1
        }
    }},
    { SPRITE_UI_CAMPAIGN_SCENARIO_ORB_BLUE, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_UI_CAMPAIGN_SCENARIO_ORB_BLUE,
            .hframes = 2,
            .vframes = 1
        }
    }},
    { SPRITE_UI_CAMPAIGN_SCENARIO_ORB_GREEN, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_UI_CAMPAIGN_SCENARIO_ORB_GREEN,
            .hframes = 2,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_ATTACK, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_ATTACK,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_STOP, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_STOP,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_DEFEND, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_DEFEND,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_BUILD, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_BUILD,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_BUILD2, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_BUILD2,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_REPAIR, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_REPAIR,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_UNLOAD, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_UNLOAD,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_CANCEL, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_CANCEL,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_EXPLODE, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_EXPLODE,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_HALL, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_HALL,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_HOUSE, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_HOUSE,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_SALOON, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_SALOON,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_BUNKER, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_BUNKER,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_SMITH, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_SMITH,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_COOP, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_COOP,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_BARRACKS, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_BARRACKS,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_SHERIFFS, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_SHERIFFS,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_MINER, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_MINER,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_WAGON, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_WAGON,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_WAR_WAGON, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_WAR_WAGON,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_COWBOY, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_COWBOY,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_BANDIT, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_BANDIT,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_SAPPER, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_SAPPER,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_PYRO, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_PYRO,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_SOLDIER, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_SOLDIER,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_CANNON, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_CANNON,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_JOCKEY, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_JOCKEY,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_DETECTIVE, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_DETECTIVE,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_BALLOON, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_BALLOON,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_LANDMINE, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_LANDMINE,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_GOLDMINE, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_GOLDMINE,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_WAGON_ARMOR, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_WAGON_ARMOR,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_WORKSHOP, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_WORKSHOP,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_BAYONETS, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_BAYONETS,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_MOLOTOV, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_MOLOTOV,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_CAMO, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_CAMO,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_DECAMO, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_DECAMO,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_PRIVATE_EYE, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_PRIVATE_EYE,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_GETAWAY_BOOTS, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_GETAWAY_BOOTS,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_IRON_SIGHTS, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_IRON_SIGHTS,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_BUTTON_ICON_CRATE, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUTTON_ICON_CRATE,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_SELECT_RING_LANDMINE, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_SELECT_RING_LANDMINE,
            .hframes = 1,
            .vframes = 1
        }
    }},
    { SPRITE_SELECT_RING_LANDMINE_ATTACK, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_SELECT_RING_LANDMINE_ATTACK,
            .hframes = 1,
            .vframes = 1
        }
    }},
    { SPRITE_SELECT_RING_UNIT, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_SELECT_RING_UNIT,
            .hframes = 1,
            .vframes = 1
        }
    }},
    { SPRITE_SELECT_RING_UNIT_ATTACK, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_SELECT_RING_UNIT_ATTACK,
            .hframes = 1,
            .vframes = 1
        }
    }},
    { SPRITE_SELECT_RING_WAGON, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_SELECT_RING_WAGON,
            .hframes = 1,
            .vframes = 1
        }
    }},
    { SPRITE_SELECT_RING_WAGON_ATTACK, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_SELECT_RING_WAGON_ATTACK,
            .hframes = 1,
            .vframes = 1
        }
    }},
    { SPRITE_SELECT_RING_BUILDING_SIZE2, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_SELECT_RING_BUILDING_SIZE2,
            .hframes = 1,
            .vframes = 1
        }
    }},
    { SPRITE_SELECT_RING_BUILDING_SIZE2_ATTACK, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_SELECT_RING_BUILDING_SIZE2_ATTACK,
            .hframes = 1,
            .vframes = 1
        }
    }},
    { SPRITE_SELECT_RING_BUILDING_SIZE3, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_SELECT_RING_BUILDING_SIZE3,
            .hframes = 1,
            .vframes = 1
        }
    }},
    { SPRITE_SELECT_RING_BUILDING_SIZE3_ATTACK, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_SELECT_RING_BUILDING_SIZE3_ATTACK,
            .hframes = 1,
            .vframes = 1
        }
    }},
    { SPRITE_SELECT_RING_BUILDING_SIZE4, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_SELECT_RING_BUILDING_SIZE4,
            .hframes = 1,
            .vframes = 1
        }
    }},
    { SPRITE_SELECT_RING_BUILDING_SIZE4_ATTACK, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_SELECT_RING_BUILDING_SIZE4_ATTACK,
            .hframes = 1,
            .vframes = 1
        }
    }},
    { SPRITE_SELECT_RING_GOLDMINE, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_SELECT_RING_GOLDMINE,
            .hframes = 1,
            .vframes = 1
        }
    }},
    { SPRITE_SELECT_RING_CRATE, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_SELECT_RING_CRATE,
            .hframes = 1,
            .vframes = 1
        }
    }},
    { SPRITE_GOLDMINE, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_GOLDMINE,
            .hframes = 4,
            .vframes = 1
        }
    }},
    { SPRITE_CRATE, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_CRATE,
            .hframes = 2,
            .vframes = 1
        }
    }},
    { SPRITE_SWITCH, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_SWITCH,
            .hframes = 2,
            .vframes = 1
        }
    }},
    { SPRITE_UNIT_WAGON, (SpriteParams) {
        .strategy = SPRITE_IMPORT_PLAYER_COLOR,
        .sheet = {
            .resource = RESOURCE_SPRITE_UNIT_WAGON,
            .hframes = 15,
            .vframes = 3
        }
    }},
    { SPRITE_UNIT_WAR_WAGON, (SpriteParams) {
        .strategy = SPRITE_IMPORT_PLAYER_COLOR,
        .sheet = {
            .resource = RESOURCE_SPRITE_UNIT_WAR_WAGON,
            .hframes = 15,
            .vframes = 3
        }
    }},
    { SPRITE_UNIT_MINER, (SpriteParams) {
        .strategy = SPRITE_IMPORT_PLAYER_COLOR,
        .sheet = {
            .resource = RESOURCE_SPRITE_UNIT_MINER,
            .hframes = 15,
            .vframes = 8
        }
    }},
    { SPRITE_UNIT_COWBOY, (SpriteParams) {
        .strategy = SPRITE_IMPORT_PLAYER_COLOR,
        .sheet = {
            .resource = RESOURCE_SPRITE_UNIT_COWBOY,
            .hframes = 15,
            .vframes = 3
        }
    }},
    { SPRITE_UNIT_SAPPER, (SpriteParams) {
        .strategy = SPRITE_IMPORT_PLAYER_COLOR,
        .sheet = {
            .resource = RESOURCE_SPRITE_UNIT_SAPPER,
            .hframes = 15,
            .vframes = 6
        }
    }},
    { SPRITE_UNIT_PYRO, (SpriteParams) {
        .strategy = SPRITE_IMPORT_PLAYER_COLOR,
        .sheet = {
            .resource = RESOURCE_SPRITE_UNIT_PYRO,
            .hframes = 15,
            .vframes = 3
        }
    }},
    { SPRITE_UNIT_JOCKEY, (SpriteParams) {
        .strategy = SPRITE_IMPORT_PLAYER_COLOR,
        .sheet = {
            .resource = RESOURCE_SPRITE_UNIT_JOCKEY,
            .hframes = 15,
            .vframes = 6
        }
    }},
    { SPRITE_UNIT_SOLDIER, (SpriteParams) {
        .strategy = SPRITE_IMPORT_PLAYER_COLOR,
        .sheet = {
            .resource = RESOURCE_SPRITE_UNIT_SOLDIER,
            .hframes = 26,
            .vframes = 3
        }
    }},
    { SPRITE_UNIT_CANNON, (SpriteParams) {
        .strategy = SPRITE_IMPORT_PLAYER_COLOR,
        .sheet = {
            .resource = RESOURCE_SPRITE_UNIT_CANNON,
            .hframes = 21,
            .vframes = 3
        }
    }},
    { SPRITE_UNIT_DETECTIVE, (SpriteParams) {
        .strategy = SPRITE_IMPORT_PLAYER_COLOR,
        .sheet = {
            .resource = RESOURCE_SPRITE_UNIT_DETECTIVE,
            .hframes = 15,
            .vframes = 3
        }
    }},
    { SPRITE_UNIT_DETECTIVE_INVISIBLE, (SpriteParams) {
        .strategy = SPRITE_IMPORT_PLAYER_COLOR_AND_LOW_ALPHA,
        .sheet = {
            .resource = RESOURCE_SPRITE_UNIT_DETECTIVE,
            .hframes = 15,
            .vframes = 3
        }
    }},
    { SPRITE_UNIT_BALLOON, (SpriteParams) {
        .strategy = SPRITE_IMPORT_PLAYER_COLOR,
        .sheet = {
            .resource = RESOURCE_SPRITE_UNIT_BALLOON,
            .hframes = 6,
            .vframes = 3
        }
    }},
    { SPRITE_UNIT_BALLOON_STEAM, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_UNIT_BALLOON_STEAM,
            .hframes = 2,
            .vframes = 1
        }
    }},
    { SPRITE_UNIT_BALLOON_SHADOW, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_UNIT_BALLOON_SHADOW,
            .hframes = 1,
            .vframes = 1
        }
    }},
    { SPRITE_UNIT_BANDIT, (SpriteParams) {
        .strategy = SPRITE_IMPORT_PLAYER_COLOR,
        .sheet = {
            .resource = RESOURCE_SPRITE_UNIT_BANDIT,
            .hframes = 15,
            .vframes = 3
        }
    }},
    { SPRITE_MINER_BUILDING, (SpriteParams) {
        .strategy = SPRITE_IMPORT_PLAYER_COLOR,
        .sheet = {
            .resource = RESOURCE_SPRITE_MINER_BUILDING,
            .hframes = 2,
            .vframes = 3
        }
    }},
    { SPRITE_BUILDING_HALL, (SpriteParams) {
        .strategy = SPRITE_IMPORT_PLAYER_COLOR,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUILDING_HALL,
            .hframes = 4,
            .vframes = 1
        }
    }},
    { SPRITE_BUILDING_HOUSE, (SpriteParams) {
        .strategy = SPRITE_IMPORT_PLAYER_COLOR,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUILDING_HOUSE,
            .hframes = 4,
            .vframes = 1
        }
    }},
    { SPRITE_BUILDING_SALOON, (SpriteParams) {
        .strategy = SPRITE_IMPORT_PLAYER_COLOR,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUILDING_SALOON,
            .hframes = 4,
            .vframes = 1
        }
    }},
    { SPRITE_BUILDING_BUNKER, (SpriteParams) {
        .strategy = SPRITE_IMPORT_PLAYER_COLOR,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUILDING_BUNKER,
            .hframes = 4,
            .vframes = 1
        }
    }},
    { SPRITE_BUILDING_SMITH, (SpriteParams) {
        .strategy = SPRITE_IMPORT_PLAYER_COLOR,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUILDING_SMITH,
            .hframes = 4,
            .vframes = 1
        }
    }},
    { SPRITE_BUILDING_SMITH_ANIMATION, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUILDING_SMITH_ANIMATION,
            .hframes = 9,
            .vframes = 1
        }
    }},
    { SPRITE_BUILDING_WORKSHOP, (SpriteParams) {
        .strategy = SPRITE_IMPORT_PLAYER_COLOR,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUILDING_WORKSHOP,
            .hframes = 19,
            .vframes = 1
        }
    }},
    { SPRITE_BUILDING_COOP, (SpriteParams) {
        .strategy = SPRITE_IMPORT_PLAYER_COLOR,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUILDING_COOP,
            .hframes = 4,
            .vframes = 1
        }
    }},
    { SPRITE_BUILDING_BARRACKS, (SpriteParams) {
        .strategy = SPRITE_IMPORT_PLAYER_COLOR,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUILDING_BARRACKS,
            .hframes = 4,
            .vframes = 1
        }
    }},
    { SPRITE_BUILDING_SHERIFFS, (SpriteParams) {
        .strategy = SPRITE_IMPORT_PLAYER_COLOR,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUILDING_SHERIFFS,
            .hframes = 4,
            .vframes = 1
        }
    }},
    { SPRITE_BUILDING_LANDMINE, (SpriteParams) {
        .strategy = SPRITE_IMPORT_PLAYER_COLOR,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUILDING_LANDMINE,
            .hframes = 4,
            .vframes = 1
        }
    }},
    { SPRITE_BUILDING_DESTROYED_BUNKER, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUILDING_DESTROYED_BUNKER,
            .hframes = 1,
            .vframes = 1
        }
    }},
    { SPRITE_BUILDING_DESTROYED_MINE, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUILDING_DESTROYED_MINE,
            .hframes = 1,
            .vframes = 1
        }
    }},
    { SPRITE_BUILDING_DESTROYED_2, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUILDING_DESTROYED_2,
            .hframes = 1,
            .vframes = 1
        }
    }},
    { SPRITE_BUILDING_DESTROYED_3, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUILDING_DESTROYED_3,
            .hframes = 1,
            .vframes = 1
        }
    }},
    { SPRITE_BUILDING_DESTROYED_4, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_BUILDING_DESTROYED_4,
            .hframes = 1,
            .vframes = 1
        }
    }},
    { SPRITE_RALLY_FLAG, (SpriteParams) {
        .strategy = SPRITE_IMPORT_PLAYER_COLOR,
        .sheet = {
            .resource = RESOURCE_SPRITE_RALLY_FLAG,
            .hframes = 6,
            .vframes = 1
        }
    }},
    { SPRITE_PARTICLE_SPARKS, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_PARTICLE_SPARKS,
            .hframes = 4,
            .vframes = 3
        }
    }},
    { SPRITE_PARTICLE_BUNKER_FIRE, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_PARTICLE_BUNKER_FIRE,
            .hframes = 2,
            .vframes = 1
        }
    }},
    { SPRITE_PARTICLE_EXPLOSION, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_PARTICLE_EXPLOSION,
            .hframes = 6,
            .vframes = 1
        }
    }},
    { SPRITE_PARTICLE_CANNON_EXPLOSION, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_PARTICLE_CANNON_EXPLOSION,
            .hframes = 4,
            .vframes = 1
        }
    }},
    { SPRITE_PARTICLE_FIRE, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_PARTICLE_FIRE,
            .hframes = 4,
            .vframes = 1
        }
    }},
    { SPRITE_PARTICLE_AVALANCHE, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_PARTICLE_AVALANCHE,
            .hframes = 3,
            .vframes = 1
        }
    }},
    { SPRITE_PROJECTILE_MOLOTOV, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_PROJECTILE_MOLOTOV,
            .hframes = 1,
            .vframes = 1
        }
    }},
    { SPRITE_WORKSHOP_STEAM, (SpriteParams) {
        .strategy = SPRITE_IMPORT_DEFAULT,
        .sheet = {
            .resource = RESOURCE_SPRITE_WORKSHOP_STEAM,
            .hframes = 5,
            .vframes = 1
        }
    }}
};

const SpriteParams& render_get_sprite_params(SpriteName sprite) {
    return SPRITE_PARAMS.at(sprite);
}

ResourceName render_get_tileset_resource(Tileset tileset) {
    switch (tileset) {
        case TILESET_ARIZONA:
            return RESOURCE_TILESET_ARIZONA;
        case TILESET_BOULDER:
            return RESOURCE_TILESET_BOULDER;
        case TILESET_KLONDIKE:
            return RESOURCE_TILESET_KLONDIKE;
        case TILESET_FOG:
            return RESOURCE_TILESET_FOG;
        case TILESET_COUNT:
            return RESOURCE_COUNT;
    }
}
