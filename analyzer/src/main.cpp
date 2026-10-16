#include "analysis.h"
#include "replay.h"

#include <cstdio>
#include <cstring>
#include <exception>
#include <fstream>
#include <iostream>
#include <iterator>
#include <nlohmann/json.hpp>
#include <stdexcept>
#include <vector>

using Json = nlohmann::ordered_json;

static void print_usage() {
  fprintf(stderr,
          "usage: analyzer <command> [file]\n"
          "\n"
          "commands:\n"
          "  header   validate the replay and print its header as JSON\n"
          "  analyze  simulate the match and print the full analysis as JSON\n"
          "\n"
          "Reads the replay from [file] if given, otherwise from stdin.\n");
}

static std::vector<uint8_t> read_all(std::istream &in) {
  return std::vector<uint8_t>(std::istreambuf_iterator<char>(in),
                              std::istreambuf_iterator<char>());
}

static std::vector<uint8_t> read_input_bytes(const char *path) {
  if (path == nullptr) {
    return read_all(std::cin);
  }
  std::ifstream file(path, std::ios::binary);
  if (!file) {
    throw std::runtime_error(std::string("Could not open ") + path + ".");
  }
  return read_all(file);
}

static bool is_active_slot(const ReplayHeader &header, uint32_t slot) {
  return header.players[slot].mode != PLAYER_MODE_INACTIVE;
}

static Json player_json(const ReplayHeader &header, uint32_t slot) {
  const MatchPlayer &player = header.players[slot];
  return {
      {"slot", slot},
      {"name", player.name},
      {"team", player.team},
      {"color", player_color_name(player.recolor_id)},
  };
}

// Players lists hold active slots only; inactive slots are left out.
static Json header_json(const ReplayHeader &header) {
  Json players = Json::array();
  for (uint32_t slot = 0; slot < MAX_PLAYERS; slot++) {
    if (is_active_slot(header, slot)) {
      players.push_back(player_json(header, slot));
    }
  }
  return {
      {"replay_version", header.version},
      {"map_type", map_type_name(header.map_type)},
      {"players", players},
  };
}

static Json summary_json(const PlayerSummary &summary) {
  return {
      {"apm", summary.apm},
      {"gold_mined_total", summary.gold_mined_total},
      {"peak_army_population", summary.peak_army_population},
      {"peak_army_value", summary.peak_army_value},
      {"units_built", summary.units_built},
      {"units_lost", summary.units_lost},
      {"kills", summary.kills},
      {"buildings_built", summary.buildings_built},
      {"upgrades_completed", summary.upgrades_completed},
      {"supply_blocked_count", summary.supply_blocked_count},
      {"supply_blocked_ticks", summary.supply_blocked_ticks},
  };
}

// An object from unit type name to count, leaving out zero counts.
static Json counts_by_type_json(const uint32_t (&counts)[ENTITY_TYPE_COUNT]) {
  Json json = Json::object();
  for (uint32_t type = 0; type < ENTITY_TYPE_COUNT; type++) {
    if (counts[type] != 0) {
      json[entity_type_name((EntityType)type)] = counts[type];
    }
  }
  return json;
}

static Json series_json(const PlayerSeries &series) {
  return {
      {"gold", series.gold},
      {"gold_mined", series.gold_mined},
      {"population", series.population},
      {"max_population", series.max_population},
      {"army_population", series.army_population},
      {"army_value", series.army_value},
      {"apm_per_minute", series.apm_per_minute},
  };
}

static Json build_order_json(const std::vector<BuildOrderItem> &build_order) {
  Json json = Json::array();
  for (const BuildOrderItem &item : build_order) {
    json.push_back({
        {"tick", item.tick},
        {"slot", item.slot},
        {"entity", entity_type_name(item.entity_type)},
        {"action", build_action_name(item.action)},
    });
  }
  return json;
}

static Json upgrades_json(const std::vector<UpgradeItem> &upgrades) {
  Json json = Json::array();
  for (const UpgradeItem &item : upgrades) {
    json.push_back({
        {"tick", item.tick},
        {"slot", item.slot},
        {"upgrade", upgrade_name(item.upgrade)},
        {"action", upgrade_action_name(item.action)},
    });
  }
  return json;
}

static Json kills_json(const std::vector<Kill> &kills) {
  Json json = Json::array();
  for (const Kill &kill : kills) {
    json.push_back({
        {"tick", kill.tick},
        {"attacker_slot", kill.attacker_slot},
        {"attacker", entity_type_name(kill.attacker_type)},
        {"defender_slot", kill.defender_slot},
        {"defender", entity_type_name(kill.defender_type)},
    });
  }
  return json;
}

static Json analysis_json(const ReplayHeader &header,
                          const Analysis &analysis) {
  Json players = Json::array();
  for (uint32_t slot = 0; slot < MAX_PLAYERS; slot++) {
    if (!is_active_slot(header, slot)) {
      continue;
    }
    const PlayerAnalysis &player = analysis.players[slot];
    Json json = player_json(header, slot);
    json["defeated_at_tick"] = player.defeated_at_tick.has_value()
                                   ? Json(*player.defeated_at_tick)
                                   : Json(nullptr);
    json["summary"] = summary_json(player.summary);
    json["units_built_by_type"] =
        counts_by_type_json(player.units_built_by_type);
    json["units_lost_by_type"] = counts_by_type_json(player.units_lost_by_type);
    json["series"] = series_json(player.series);
    players.push_back(json);
  }
  return {
      {"analyzer_version", ANALYZER_VERSION},
      {"replay_version", header.version},
      {"map_type", map_type_name(header.map_type)},
      {"duration_ticks", analysis.duration_ticks},
      {"sample_interval_ticks", SAMPLE_INTERVAL_TICKS},
      {"players", players},
      {"build_order", build_order_json(analysis.build_order)},
      {"upgrades", upgrades_json(analysis.upgrades)},
      {"kills", kills_json(analysis.kills)},
  };
}

int main(int argc, char **argv) {
  if (argc < 2 || argc > 3) {
    print_usage();
    return 2;
  }

  const char *command = argv[1];
  const char *path = argc == 3 ? argv[2] : nullptr;

  try {
    if (strcmp(command, "header") == 0) {
      std::vector<uint8_t> bytes = read_input_bytes(path);
      Replay replay = replay_read(bytes);
      std::cout << header_json(replay.header).dump(2) << "\n";
      return 0;
    }
    if (strcmp(command, "analyze") == 0) {
      std::vector<uint8_t> bytes = read_input_bytes(path);
      Replay replay = replay_read(bytes);
      Analysis analysis = analyze_replay(replay);
      std::cout << analysis_json(replay.header, analysis).dump(2) << "\n";
      return 0;
    }
  } catch (const std::exception &e) {
    fprintf(stderr, "analyzer: %s\n", e.what());
    return 1;
  }

  print_usage();
  return 2;
}
