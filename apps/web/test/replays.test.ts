// Checks the replay API calls the upload and replay list pages rely on,
// when the list polls, and the plain functions behind what the pages show.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  maxReplayFileBytes,
  replayUploadField,
  type Replay,
  type ReplayPage,
} from "@goldrush/shared";
import {
  choosePlayer,
  fetchReplayPage,
  pageHasPendingAnalysis,
  uploadReplays,
} from "../src/api/replays.ts";
import {
  listParamsFromSearch,
  listSearchParams,
  pageCount,
} from "../src/pages/replays/page-param.ts";
import {
  formatDuration,
  matchFormat,
  uploaderPlayer,
  uploaderResultLabel,
  winners,
} from "../src/pages/replays/replay-display.ts";
import { checkReplayFiles } from "../src/pages/upload/check-files.ts";
import { stubFetch } from "./stub-fetch.ts";

function makeReplay(overrides: Partial<Replay> = {}): Replay {
  return {
    id: 7,
    filename: "test_loss.rep",
    uploaderUsername: "stew",
    uploadedAt: "2026-10-17T12:00:00.000Z",
    processedAt: null,
    mapType: "tombstone",
    replayVersion: 0,
    durationTicks: null,
    status: "awaiting_player",
    error: null,
    uploaderSlot: null,
    players: [
      {
        slot: 0,
        name: "stew",
        team: 0,
        color: "green",
        result: null,
        defeatedAtTick: null,
      },
      {
        slot: 1,
        name: "Bot",
        team: 1,
        color: "red",
        result: null,
        defeatedAtTick: null,
      },
    ],
    ...overrides,
  };
}

function makePage(replays: Replay[]): ReplayPage {
  return { replays, page: 1, pageSize: 20, total: replays.length };
}

test("uploadReplays posts every file as multipart and returns each result", async (t) => {
  const replay = makeReplay();
  const requests = stubFetch(
    t,
    Response.json({
      files: [
        { outcome: "accepted", filename: "a.rep", replay },
        { outcome: "rejected", filename: "b.rep", reason: "Not a replay" },
      ],
    }),
  );
  const results = await uploadReplays([
    new File(["aaa"], "a.rep"),
    new File(["bbb"], "b.rep"),
  ]);

  assert.equal(requests[0]!.method, "POST");
  assert.equal(new URL(requests[0]!.url).pathname, "/api/replays");
  const form = await requests[0]!.formData();
  const sent = form.getAll(replayUploadField) as File[];
  assert.deepEqual(
    sent.map((file) => file.name),
    ["a.rep", "b.rep"],
  );
  assert.deepEqual(results, [
    { outcome: "accepted", filename: "a.rep", replay },
    { outcome: "rejected", filename: "b.rep", reason: "Not a replay" },
  ]);
});

test("choosePlayer posts the slot and returns the queued replay", async (t) => {
  const queued = makeReplay({ status: "queued", uploaderSlot: 1 });
  const requests = stubFetch(t, Response.json(queued));
  assert.deepEqual(await choosePlayer(7, 1), queued);
  assert.equal(requests[0]!.method, "POST");
  assert.equal(new URL(requests[0]!.url).pathname, "/api/replays/7/player");
  assert.deepEqual(await requests[0]!.json(), { slot: 1 });
});

test("fetchReplayPage asks for the page of the public list and parses it", async (t) => {
  const page = { ...makePage([makeReplay()]), page: 3, total: 41 };
  const requests = stubFetch(t, Response.json(page));
  assert.deepEqual(await fetchReplayPage(3, false), page);
  assert.equal(requests[0]!.method, "GET");
  const url = new URL(requests[0]!.url);
  assert.equal(url.pathname, "/api/replays");
  assert.equal(url.searchParams.get("page"), "3");
  assert.equal(url.searchParams.get("mine"), null);
});

test("fetchReplayPage asks for the user's own replays when mine is set", async (t) => {
  const requests = stubFetch(t, Response.json(makePage([])));
  await fetchReplayPage(2, true);
  const url = new URL(requests[0]!.url);
  assert.equal(url.searchParams.get("page"), "2");
  assert.equal(url.searchParams.get("mine"), "true");
});

test("the list polls only while a replay on it is queued or processing", () => {
  const settled = [
    makeReplay({ id: 1 }),
    makeReplay({ id: 2, status: "processed", uploaderSlot: 0 }),
    makeReplay({ id: 3, status: "failed", uploaderSlot: 0, error: "boom" }),
  ];
  assert.equal(pageHasPendingAnalysis(makePage([])), false);
  assert.equal(pageHasPendingAnalysis(makePage(settled)), false);
  for (const status of ["queued", "processing"] as const) {
    const pending = makeReplay({ id: 4, status, uploaderSlot: 0 });
    assert.equal(pageHasPendingAnalysis(makePage([...settled, pending])), true);
  }
});

test("formatDuration shows m:ss at 60 ticks per second", () => {
  assert.equal(formatDuration(null), "–");
  assert.equal(formatDuration(0), "0:00");
  assert.equal(formatDuration(59), "0:00");
  assert.equal(formatDuration(60 * 65), "1:05");
  assert.equal(formatDuration(60 * (41 * 60 + 7) + 30), "41:07");
  assert.equal(formatDuration(60 * 3600), "60:00");
});

test("the uploader's result is the player whose slot is uploaderSlot", () => {
  const awaiting = makeReplay();
  assert.equal(uploaderPlayer(awaiting), undefined);
  assert.equal(uploaderResultLabel(awaiting), "–");

  const queued = makeReplay({ status: "queued", uploaderSlot: 1 });
  assert.equal(uploaderPlayer(queued)?.name, "Bot");
  assert.equal(uploaderResultLabel(queued), "–");

  const [stew, bot] = makeReplay().players;
  const processed = makeReplay({
    status: "processed",
    uploaderSlot: 1,
    players: [
      { ...stew!, result: "loss" },
      { ...bot!, result: "win" },
    ],
  });
  assert.equal(uploaderResultLabel(processed), "Win");
  assert.equal(uploaderResultLabel({ ...processed, uploaderSlot: 0 }), "Loss");
});

test("checkReplayFiles rejects files over the size limit and non-.rep files", () => {
  const atLimit = new File([new Uint8Array(maxReplayFileBytes)], "ok.rep");
  const overLimit = new File(
    [new Uint8Array(maxReplayFileBytes + 1)],
    "big.rep",
  );
  const upperCase = new File(["x"], "LOUD.REP");
  const notReplay = new File(["x"], "notes.txt");

  const { toUpload, rejected } = checkReplayFiles([
    atLimit,
    overLimit,
    upperCase,
    notReplay,
  ]);
  assert.deepEqual(toUpload, [atLimit, upperCase]);
  assert.deepEqual(rejected, [
    { outcome: "rejected", filename: "big.rep", reason: "File is over 5 MB" },
    { outcome: "rejected", filename: "notes.txt", reason: "Not a .rep file" },
  ]);
});

test("listParamsFromSearch falls back to page 1 for anything but a page number", () => {
  const pageOf = (query: string) =>
    listParamsFromSearch(new URLSearchParams(query)).page;
  assert.equal(pageOf(""), 1);
  assert.equal(pageOf("page=3"), 3);
  assert.equal(pageOf("page=0"), 1);
  assert.equal(pageOf("page=-2"), 1);
  assert.equal(pageOf("page=1.5"), 1);
  assert.equal(pageOf("page=abc"), 1);
});

test("listParamsFromSearch reads mine, and a bad mine doesn't reset the page", () => {
  const params = (query: string) =>
    listParamsFromSearch(new URLSearchParams(query));
  assert.deepEqual(params(""), { page: 1, mine: false });
  assert.deepEqual(params("mine=true&page=2"), { page: 2, mine: true });
  assert.deepEqual(params("mine=false"), { page: 1, mine: false });
  assert.deepEqual(params("mine=maybe&page=4"), { page: 4, mine: false });
});

test("listSearchParams leaves out defaults and round-trips", () => {
  assert.equal(listSearchParams({ page: 1, mine: false }).toString(), "");
  assert.equal(listSearchParams({ page: 3, mine: false }).toString(), "page=3");
  for (const params of [
    { page: 1, mine: true },
    { page: 5, mine: true },
    { page: 2, mine: false },
  ]) {
    assert.deepEqual(listParamsFromSearch(listSearchParams(params)), params);
  }
});

test("matchFormat works the format out from team sizes", () => {
  const teams = (...layout: number[]) => layout.map((team) => ({ team }));
  assert.equal(matchFormat(teams(0, 1)), "1v1");
  assert.equal(matchFormat(teams(0, 0, 1, 1)), "2v2");
  assert.equal(matchFormat(teams(0, 1, 2)), "FFA");
  assert.equal(matchFormat(teams(0, 1, 2, 3)), "FFA");
  assert.equal(matchFormat(teams(0, 0, 1)), "Other");
  assert.equal(matchFormat(teams(0, 0, 0, 1)), "Other");
  assert.equal(matchFormat(teams(0, 0, 1, 2)), "Other");
  assert.equal(matchFormat(teams(0, 0)), "Other");
});

test("winners are the players with a win, and none when everyone lost", () => {
  const [first, second] = makeReplay().players;
  const won = { ...first!, result: "win" as const };
  const lost = { ...second!, result: "loss" as const };
  assert.deepEqual(winners([won, lost]), [won]);
  assert.deepEqual(winners([{ ...won, result: "loss" }, lost]), []);
});

test("pageCount rounds up and is at least 1", () => {
  assert.equal(pageCount(0, 20), 1);
  assert.equal(pageCount(20, 20), 1);
  assert.equal(pageCount(21, 20), 2);
});
