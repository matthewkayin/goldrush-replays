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

// Active players only; inactive slots are left out.
static Json players_json(const ReplayHeader &header) {
  Json players = Json::array();
  for (uint32_t slot = 0; slot < MAX_PLAYERS; slot++) {
    const MatchPlayer &player = header.players[slot];
    if (player.mode == PLAYER_MODE_INACTIVE) {
      continue;
    }
    players.push_back({
        {"slot", slot},
        {"name", player.name},
        {"team", player.team},
        {"color", player_color_name(player.recolor_id)},
    });
  }
  return players;
}

static Json header_json(const ReplayHeader &header) {
  return {
      {"replay_version", header.version},
      {"map_type", map_type_name(header.map_type)},
      {"players", players_json(header)},
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
      fprintf(stderr, "%s: not implemented yet\n", command);
      return 1;
    }
  } catch (const std::exception &e) {
    fprintf(stderr, "analyzer: %s\n", e.what());
    return 1;
  }

  print_usage();
  return 2;
}
