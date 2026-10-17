// Checks the replay API calls the upload and "My replays" pages rely on,
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
  pageCount,
  pageFromSearchParam,
} from "../src/pages/replays/page-param.ts";
import {
  formatDuration,
  uploaderPlayer,
  uploaderResultLabel,
} from "../src/pages/replays/replay-display.ts";
import { checkReplayFiles } from "../src/pages/upload/check-files.ts";
import { stubFetch } from "./stub-fetch.ts";

function makeReplay(overrides: Partial<Replay> = {}): Replay {
  return {
    id: 7,
    filename: "test_loss.rep",
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

test("fetchReplayPage asks for the page and parses it", async (t) => {
  const page = { ...makePage([makeReplay()]), page: 3, total: 41 };
  const requests = stubFetch(t, Response.json(page));
  assert.deepEqual(await fetchReplayPage(3), page);
  assert.equal(requests[0]!.method, "GET");
  const url = new URL(requests[0]!.url);
  assert.equal(url.pathname, "/api/replays");
  assert.equal(url.searchParams.get("page"), "3");
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

test("pageFromSearchParam falls back to page 1 for anything but a page number", () => {
  assert.equal(pageFromSearchParam(null), 1);
  assert.equal(pageFromSearchParam("3"), 3);
  assert.equal(pageFromSearchParam("0"), 1);
  assert.equal(pageFromSearchParam("-2"), 1);
  assert.equal(pageFromSearchParam("1.5"), 1);
  assert.equal(pageFromSearchParam("abc"), 1);
});

test("pageCount rounds up and is at least 1", () => {
  assert.equal(pageCount(0, 20), 1);
  assert.equal(pageCount(20, 20), 1);
  assert.equal(pageCount(21, 20), 2);
});
