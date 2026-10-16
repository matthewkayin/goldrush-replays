import type { TestContext } from "node:test";

// Makes fetch return `response` for the rest of the test, and records the
// requests it was called with.
export function stubFetch(t: TestContext, response: Response): Request[] {
  const requests: Request[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (input: string, init: RequestInit) => {
      requests.push(new Request(new URL(input, "http://test"), init));
      return response;
    },
  );
  return requests;
}
