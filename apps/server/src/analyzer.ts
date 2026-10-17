// Runs the C++ analyzer as a child process. Replay bytes go in on stdin and
// JSON comes back on stdout, so nothing is written to disk. Only
// readReplayHeader may run during an HTTP request; analyzeReplay is for the
// worker.
import { spawn } from "node:child_process";
import {
  analysisSchema,
  replayHeaderSchema,
  type Analysis,
  type ReplayHeader,
} from "@goldrush/shared";

// `analyzer header` finishes in milliseconds, so this only guards against a
// hung process holding a request open.
const HEADER_TIMEOUT_MS = 10_000;

// The analyzer rejected the replay (it exited non-zero, with the reason on
// stderr) or ran out of time. Failing to start the analyzer at all is a
// plain Error instead, since it's a problem with the server, not the replay.
export class AnalyzerError extends Error {}

interface RunOptions {
  timeoutMs: number;
  // Kills the analyzer when aborted, e.g. when the worker shuts down.
  signal?: AbortSignal;
}

// The analyzer's stdout. Rejects with AnalyzerError when it exits non-zero
// or times out, and with the abort reason when `signal` is aborted.
function runAnalyzer(
  analyzerPath: string,
  command: "header" | "analyze",
  input: Buffer,
  { timeoutMs, signal }: RunOptions,
): Promise<string> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    // In its own process group, so Ctrl-C in `pnpm dev` reaches only the
    // worker, which then kills the analyzer through `signal`. Otherwise the
    // analyzer could die first and its run would count as a failed attempt
    // instead of an interrupted one.
    const child = spawn(analyzerPath, [command], {
      stdio: ["pipe", "pipe", "pipe"],
      detached: true,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    const onAbort = () => child.kill("SIGKILL");
    signal?.addEventListener("abort", onAbort, { once: true });

    child.on("error", (error) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (signal?.aborted) {
        reject(signal.reason);
      } else if (timedOut) {
        reject(
          new AnalyzerError(
            `The analyzer timed out after ${timeoutMs / 1000} s.`,
          ),
        );
      } else if (code !== 0) {
        reject(new AnalyzerError(errorMessage(stderr, code)));
      } else {
        resolve(Buffer.concat(stdout).toString("utf8"));
      }
    });

    // The analyzer may exit before reading all of stdin (e.g. on a bad
    // signature). The exit code says what went wrong, so a broken pipe
    // here isn't worth reporting.
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

// The analyzer writes "analyzer: <message>" to stderr.
function errorMessage(stderr: Buffer[], code: number | null): string {
  const message = Buffer.concat(stderr)
    .toString("utf8")
    .trim()
    .replace(/^analyzer: /, "");
  return message || `The analyzer failed with exit code ${code}.`;
}

export type HeaderResult =
  { valid: true; header: ReplayHeader } | { valid: false; reason: string };

// Validates a replay with `analyzer header`. An invalid replay isn't an
// error: it comes back with the analyzer's reason.
export async function readReplayHeader(
  analyzerPath: string,
  replay: Buffer,
): Promise<HeaderResult> {
  let stdout: string;
  try {
    stdout = await runAnalyzer(analyzerPath, "header", replay, {
      timeoutMs: HEADER_TIMEOUT_MS,
    });
  } catch (error) {
    if (error instanceof AnalyzerError) {
      return { valid: false, reason: error.message };
    }
    throw error;
  }
  return { valid: true, header: replayHeaderSchema.parse(JSON.parse(stdout)) };
}

// Simulates the match with `analyzer analyze`. Takes seconds to minutes, so
// only the worker calls it.
export async function analyzeReplay(
  analyzerPath: string,
  replay: Buffer,
  options: RunOptions,
): Promise<Analysis> {
  const stdout = await runAnalyzer(analyzerPath, "analyze", replay, options);
  return analysisSchema.parse(JSON.parse(stdout));
}
