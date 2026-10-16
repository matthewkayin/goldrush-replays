#!/usr/bin/env bash
# Recreates the invalid replay fixtures in analyzer/test_replays/invalid/ from
# test_loss.rep. Each fixture breaks the replay in one way the analyzer must
# reject. The byte offsets below are specific to test_loss.rep.
set -euo pipefail

cd "$(dirname "$0")/../test_replays"
source=test_loss.rep
mkdir -p invalid

# Signature (bytes 0-3) zeroed.
{ printf '\x00\x00\x00\x00'; tail -c +5 "$source"; } >invalid/bad_signature.rep

# Version (bytes 4-7) set to 1.
{ head -c 4 "$source"; printf '\x01\x00\x00\x00'; tail -c +9 "$source"; } >invalid/unknown_version.rep

# Cut inside the player block (bytes 16405-16628).
head -c 16500 "$source" >invalid/truncated_header.rep

# Cut inside the last INPUT entry, whose 9-byte payload starts at byte 38266.
# A cut exactly between entries can't be detected.
head -c 38270 "$source" >invalid/truncated_entries.rep
