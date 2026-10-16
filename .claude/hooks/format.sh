#!/usr/bin/env bash
# PostToolUse hook for Edit|Write: formats the file Claude just changed.
# C++ under analyzer/ uses clang-format's built-in LLVM style; web files use prettier.
set -euo pipefail

project_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"
file="$(jq -r '.tool_input.file_path // empty')"

[[ -n "$file" && -f "$file" ]] || exit 0

relative="${file#"$project_dir"/}"
[[ "$relative" != "$file" ]] || exit 0  # outside the project
case "$relative" in
    # analyzer/src/simulation/ is the game's code; it stays byte-close to the original.
    old-project/* | analyzer/src/simulation/* | */node_modules/* | node_modules/*) exit 0 ;;
esac

case "$relative" in
    analyzer/*.cpp | analyzer/*.h | analyzer/*.hpp | analyzer/*.cc)
        clang-format -i --style=LLVM "$file"
        ;;
    *.ts | *.tsx | *.js | *.mjs | *.cjs | *.json | *.css | *.html)
        cd "$project_dir" && pnpm exec prettier --write --log-level warn "$file"
        ;;
esac
