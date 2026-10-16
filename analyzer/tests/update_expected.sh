#!/usr/bin/env bash
# Regenerates the expected output files next to each replay in
# analyzer/test_replays/ from the current analyzer build. Only run this after
# checking that the change in output is intended, and review the git diff.
set -euo pipefail

analyzer_dir="$(cd "$(dirname "$0")/.." && pwd)"
analyzer="$analyzer_dir/build/analyzer"

for replay in "$analyzer_dir"/test_replays/*.rep; do
    "$analyzer" header "$replay" >"${replay%.rep}.header.json"
done
