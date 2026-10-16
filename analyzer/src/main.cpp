#include <cstdio>
#include <cstring>

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

int main(int argc, char **argv) {
  if (argc < 2 || argc > 3) {
    print_usage();
    return 2;
  }

  const char *command = argv[1];
  if (strcmp(command, "header") == 0 || strcmp(command, "analyze") == 0) {
    fprintf(stderr, "%s: not implemented yet\n", command);
    return 1;
  }

  print_usage();
  return 2;
}
