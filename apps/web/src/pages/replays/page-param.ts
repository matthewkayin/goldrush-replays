import { replayListQuerySchema } from "@goldrush/shared";

// What the replay list shows, as kept in the URL: `?page=` and `?mine=`.
export interface ListParams {
  page: number;
  mine: boolean;
}

const defaults = replayListQuerySchema.parse({});

// The list from the URL, with the same rules as the server. Each parameter
// falls back to its default on its own when it's missing or invalid, so a
// bad `?mine=` doesn't also reset the page.
export function listParamsFromSearch(
  searchParams: URLSearchParams,
): ListParams {
  const page = replayListQuerySchema.shape.page.safeParse(
    searchParams.get("page") ?? undefined,
  );
  const mine = replayListQuerySchema.shape.mine.safeParse(
    searchParams.get("mine") ?? undefined,
  );
  return {
    page: page.success ? page.data : defaults.page,
    mine: mine.success ? mine.data : defaults.mine,
  };
}

// The query string for a list, leaving out parameters at their defaults so
// the plain list is just `/replays`.
export function listSearchParams({ page, mine }: ListParams): URLSearchParams {
  const searchParams = new URLSearchParams();
  if (mine !== defaults.mine) {
    searchParams.set("mine", String(mine));
  }
  if (page !== defaults.page) {
    searchParams.set("page", String(page));
  }
  return searchParams;
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
