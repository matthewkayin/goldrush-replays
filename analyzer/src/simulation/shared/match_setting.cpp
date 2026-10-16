#include "match_setting.h"

#include <unordered_map>

static std::unordered_map<MatchSetting, MatchSettingData> MATCH_SETTING_DATA;

void match_setting_init() {
    MATCH_SETTING_DATA[MATCH_SETTING_TEAMS] = (MatchSettingData) {
        .name = "Teams",
        .values = { "Disabled", "Enabled" },
        .value_count = TEAMS_COUNT
    };
    MATCH_SETTING_DATA[MATCH_SETTING_MAP_TYPE] = (MatchSettingData) {
        .name = "Map Type",
        .values = { "Tombstone", "Boulder", "Klondike" },
        .value_count = MAP_TYPE_COUNT
    };
    MATCH_SETTING_DATA[MATCH_SETTING_MAP_SIZE] = (MatchSettingData) {
        .name = "Map Size",
        .values = { "Small", "Medium", "Large" },
        .value_count = TEAMS_COUNT
    };
    MATCH_SETTING_DATA[MATCH_SETTING_DIFFICULTY] = (MatchSettingData) {
        .name = "Difficulty",
        .values = { "Easy", "Moderate", "Hard" },
        .value_count = DIFFICULTY_COUNT
    };
}

const MatchSettingData& match_setting_data(MatchSetting setting) {
    static bool initialized = false;
    if (!initialized) {
        match_setting_init();
        initialized = true;
    }
    return MATCH_SETTING_DATA.at(setting);
}
