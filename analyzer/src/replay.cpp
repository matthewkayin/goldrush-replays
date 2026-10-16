#include "replay.h"

#include "simulation/util/memread.h"
#include <cstring>
#include <format>
#include <stdexcept>

// The largest serialized input the game sends (NETWORK_INPUT_BUFFER_SIZE in
// the game).
const size_t INPUT_BUFFER_SIZE = 1024;

// A chat entry is the game's ChatMessage struct written as raw bytes:
// prefix_font, timer, prefix[MAX_USERNAME_LENGTH + 4], message[128].
const size_t CHAT_ENTRY_SIZE = 4 + 4 + (MAX_USERNAME_LENGTH + 4) + 128;

// Players are written as raw MatchPlayer structs, so the struct must keep the
// game's layout.
static_assert(sizeof(MatchPlayer) == 56);

static const char *MAP_TYPE_NAMES[MAP_TYPE_COUNT] = {"tombstone", "boulder",
                                                     "klondike"};
static const char *PLAYER_COLOR_NAMES[] = {"blue", "red", "green", "purple"};
static const uint8_t PLAYER_COLOR_COUNT = 4;

const char *map_type_name(MapType map_type) { return MAP_TYPE_NAMES[map_type]; }

const char *player_color_name(uint8_t recolor_id) {
  return PLAYER_COLOR_NAMES[recolor_id];
}

// memread with a message fit to show a user. The map is the one part read
// with the simulation's raw_map_memread, which reports truncation in its own
// words.
static void read_bytes(void *dst, size_t size, MemCursor &cursor) {
  if (cursor.bytes_total - cursor.bytes_read < size) {
    throw std::runtime_error("Replay file is truncated.");
  }
  memread(dst, size, &cursor);
}

static void validate_player(const MatchPlayer &player, uint32_t slot) {
  if (player.mode != PLAYER_MODE_INACTIVE &&
      player.mode != PLAYER_MODE_ACTIVE) {
    throw std::runtime_error(
        std::format("Player {} has invalid mode {}.", slot, player.mode));
  }
  if (memchr(player.name, '\0', MAX_USERNAME_LENGTH + 1) == nullptr) {
    throw std::runtime_error(
        std::format("Player {} name is not null-terminated.", slot));
  }
  if (player.recolor_id >= PLAYER_COLOR_COUNT) {
    throw std::runtime_error(std::format("Player {} has invalid color {}.",
                                         slot, player.recolor_id));
  }
  if (player.team >= MAX_PLAYERS) {
    throw std::runtime_error(
        std::format("Player {} has invalid team {}.", slot, player.team));
  }
}

static void read_header(ReplayHeader &header, MemCursor &cursor) {
  uint32_t signature;
  read_bytes(&signature, sizeof(signature), cursor);
  if (signature != REPLAY_SIGNATURE) {
    throw std::runtime_error("Not a Gold Rush replay (bad signature).");
  }

  read_bytes(&header.version, sizeof(header.version), cursor);
  if (header.version != REPLAY_VERSION) {
    throw std::runtime_error(
        std::format("Unsupported replay version {}.", header.version));
  }

  read_bytes(&header.lcg_seed, sizeof(header.lcg_seed), cursor);

  uint8_t map_type;
  read_bytes(&map_type, sizeof(map_type), cursor);
  if (map_type >= MAP_TYPE_COUNT) {
    throw std::runtime_error(std::format("Unknown map type {}.", map_type));
  }
  header.map_type = (MapType)map_type;

  header.raw_map = std::make_unique<RawMap>();
  raw_map_memread(header.raw_map.get(), &cursor);

  for (uint32_t slot = 0; slot < MAX_PLAYERS; slot++) {
    read_bytes(&header.players[slot], sizeof(MatchPlayer), cursor);
    validate_player(header.players[slot], slot);
  }
}

static MatchInput read_input(MemCursor &cursor) {
  // The game writes the length as a size_t, which is 8 bytes on every
  // platform it ships on.
  uint64_t length;
  read_bytes(&length, sizeof(length), cursor);
  if (length == 0 || length > INPUT_BUFFER_SIZE) {
    throw std::runtime_error(
        std::format("Replay input has invalid length {}.", length));
  }

  // The buffer is zero-filled and much larger than any input, so
  // match_input_deserialize can't read past it even when the length is wrong.
  // Its selection counts are bounds-checked inside the simulation.
  uint8_t buffer[INPUT_BUFFER_SIZE] = {};
  read_bytes(buffer, length, cursor);
  if (buffer[0] >= MATCH_INPUT_TYPE_COUNT) {
    throw std::runtime_error(
        std::format("Replay input has unknown type {}.", buffer[0]));
  }

  size_t head = 0;
  MatchInput input = match_input_deserialize(buffer, head);
  if (head != length) {
    throw std::runtime_error(
        std::format("Replay input is {} bytes but its contents are {} bytes.",
                    length, head));
  }
  return input;
}

static void read_entries(Replay &replay, MemCursor &cursor) {
  while (!cursor.finished()) {
    uint8_t type;
    read_bytes(&type, sizeof(type), cursor);

    if (type == REPLAY_ENTRY_NEW_TURN) {
      replay.turns.emplace_back();
      continue;
    }
    if (replay.turns.empty()) {
      throw std::runtime_error("Replay has an entry before its first turn.");
    }

    switch (type) {
    case REPLAY_ENTRY_INPUT: {
      ReplayEntry entry = {};
      entry.type = REPLAY_ENTRY_INPUT;
      entry.input = read_input(cursor);
      replay.turns.back().push_back(entry);
      break;
    }
    case REPLAY_ENTRY_CHAT: {
      uint8_t chat[CHAT_ENTRY_SIZE];
      read_bytes(chat, sizeof(chat), cursor);
      break;
    }
    case REPLAY_ENTRY_DISCONNECT: {
      ReplayEntry entry = {};
      entry.type = REPLAY_ENTRY_DISCONNECT;
      read_bytes(&entry.disconnect_player_id,
                 sizeof(entry.disconnect_player_id), cursor);
      if (entry.disconnect_player_id >= MAX_PLAYERS) {
        throw std::runtime_error(
            std::format("Replay disconnects invalid player {}.",
                        entry.disconnect_player_id));
      }
      replay.turns.back().push_back(entry);
      break;
    }
    default:
      throw std::runtime_error(
          std::format("Replay has unknown entry type {}.", type));
    }
  }

  if (replay.turns.empty()) {
    throw std::runtime_error("Replay has no turns.");
  }
}

Replay replay_read(std::span<uint8_t> bytes) {
  MemCursor cursor = {
      .ptr = bytes.data(), .bytes_read = 0, .bytes_total = bytes.size()};

  Replay replay;
  read_header(replay.header, cursor);
  read_entries(replay, cursor);
  return replay;
}
