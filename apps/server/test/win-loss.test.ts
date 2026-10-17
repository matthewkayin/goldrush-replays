// Checks the win/loss rule against the defeat ticks and teams the analyzer
// reported for every test replay, with the uploader in each kind of slot,
// plus the cases those replays don't cover.
import assert from "node:assert/strict";
import { test } from "node:test";
import { analysisSchema } from "@goldrush/shared";
import { decideResults, type PlayerStanding } from "../src/win-loss.ts";
import { readExpectedAnalysis } from "./replay-helpers.ts";

function standings(name: string): PlayerStanding[] {
  return analysisSchema
    .parse(readExpectedAnalysis(name))
    .players.map((player) => ({
      slot: player.slot,
      team: player.team,
      defeatedAtTick: player.defeated_at_tick,
    }));
}

// The results in slot order, e.g. ["loss", "win"].
function results(players: PlayerStanding[], uploaderSlot: number): string[] {
  const bySlot = decideResults(players, uploaderSlot);
  return players.map((player) => bySlot.get(player.slot)!);
}

test("test_loss: both players are active at the end, so the uploader left and lost", () => {
  const players = standings("test_loss");
  assert.deepEqual(results(players, 0), ["loss", "win"]);
  assert.deepEqual(results(players, 1), ["win", "loss"]);
});

test("test_victory_long: the bot disconnected, so the uploader's team won", () => {
  const players = standings("test_victory_long");
  assert.deepEqual(results(players, 0), ["win", "loss"]);
  // Whoever uploaded it, the last team standing wins.
  assert.deepEqual(results(players, 1), ["win", "loss"]);
});

test("test_team: both of team 1 were defeated, so team 0 won", () => {
  const players = standings("test_team");
  for (const uploaderSlot of [0, 1, 2, 3]) {
    assert.deepEqual(results(players, uploaderSlot), [
      "win",
      "win",
      "loss",
      "loss",
    ]);
  }
});

test("test_ffa: everyone is active at the end, so only the uploader lost", () => {
  const players = standings("test_ffa");
  assert.deepEqual(results(players, 0), ["loss", "win", "win", "win"]);
  assert.deepEqual(results(players, 2), ["win", "win", "loss", "win"]);
});

test("the uploader's team loses with an active teammate if an opponent is still active", () => {
  const players: PlayerStanding[] = [
    { slot: 0, team: 0, defeatedAtTick: 500 },
    { slot: 1, team: 0, defeatedAtTick: null },
    { slot: 2, team: 1, defeatedAtTick: null },
    { slot: 3, team: 1, defeatedAtTick: 900 },
  ];
  assert.deepEqual(results(players, 0), ["loss", "loss", "win", "win"]);
});

test("a defeated uploader watching two other active teams: both of them win", () => {
  const players: PlayerStanding[] = [
    { slot: 0, team: 0, defeatedAtTick: 500 },
    { slot: 1, team: 1, defeatedAtTick: null },
    { slot: 2, team: 2, defeatedAtTick: null },
  ];
  assert.deepEqual(results(players, 0), ["loss", "win", "win"]);
});

test("when everyone was defeated, the winner is unknown and no one wins", () => {
  const players: PlayerStanding[] = [
    { slot: 0, team: 0, defeatedAtTick: 1000 },
    { slot: 1, team: 1, defeatedAtTick: 800 },
    { slot: 2, team: 1, defeatedAtTick: 600 },
  ];
  // Even when the uploader's team was defeated last.
  assert.deepEqual(results(players, 0), ["loss", "loss", "loss"]);
  assert.deepEqual(results(players, 1), ["loss", "loss", "loss"]);
});

test("an uploader slot with no player is an error", () => {
  assert.throws(() => decideResults(standings("test_loss"), 3), /slot 3/);
});
