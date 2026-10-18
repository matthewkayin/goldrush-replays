import { replayListQuerySchema, type MatchFormat } from "@goldrush/shared";

// What the replay list shows, as kept in the URL: `?page=`, `?mine=` and
// the filters. Text filters are kept as typed (the server trims them), with
// "" for unset. `from` and `to` are whole days (YYYY-MM-DD) in the viewer's
// time zone, both inclusive; replayListQuery turns them into instants.
// `user` is an exact uploader username, set by a profile's "See all
// replays" link, or null.
export interface ListParams {
  page: number;
  mine: boolean;
  user: string | null;
  uploader: string;
  filename: string;
  player: string;
  format: MatchFormat | null;
  from: string | null;
  to: string | null;
}

export type ListFilters = Omit<ListParams, "page">;

const textKeys = ["uploader", "filename", "player"] as const;
const maxTextLength = 100;

const defaults: ListParams = {
  page: 1,
  mine: false,
  user: null,
  uploader: "",
  filename: "",
  player: "",
  format: null,
  from: null,
  to: null,
};

// The filters "Clear filters" resets. "My replays" has its own switch, so
// it stays as it is.
export const noFilters = {
  user: null,
  uploader: "",
  filename: "",
  player: "",
  format: null,
  from: null,
  to: null,
} satisfies Partial<ListFilters>;

// The list from the URL, with the same rules as the server. Each parameter
// falls back to its default on its own when it's missing or invalid, so a
// bad `?mine=` doesn't also reset the page.
export function listParamsFromSearch(
  searchParams: URLSearchParams,
): ListParams {
  const value = (key: string) => searchParams.get(key) ?? undefined;
  const page = replayListQuerySchema.shape.page.safeParse(value("page"));
  const mine = replayListQuerySchema.shape.mine.safeParse(value("mine"));
  const format = replayListQuerySchema.shape.format.safeParse(value("format"));
  const user = replayListQuerySchema.shape.user.safeParse(value("user"));
  const params: ListParams = {
    ...defaults,
    page: page.success ? page.data : defaults.page,
    mine: mine.success ? mine.data : defaults.mine,
    user: (user.success && user.data) || defaults.user,
    format: (format.success && format.data) || defaults.format,
    from: parseDay(value("from")),
    to: parseDay(value("to")),
  };
  for (const key of textKeys) {
    const text = value(key) ?? "";
    params[key] = text.length <= maxTextLength ? text : defaults[key];
  }
  return params;
}

// The query string for a list, leaving out parameters at their defaults so
// the plain list is just `/replays`.
export function listSearchParams(params: ListParams): URLSearchParams {
  const searchParams = new URLSearchParams();
  if (params.mine !== defaults.mine) {
    searchParams.set("mine", String(params.mine));
  }
  for (const key of textKeys) {
    if (params[key] !== defaults[key]) {
      searchParams.set(key, params[key]);
    }
  }
  for (const key of ["user", "format", "from", "to"] as const) {
    const value = params[key];
    if (value !== null) {
      searchParams.set(key, value);
    }
  }
  if (params.page !== defaults.page) {
    searchParams.set("page", String(params.page));
  }
  return searchParams;
}

// A filter change goes back to page 1.
export function withFilters(
  params: ListParams,
  changes: Partial<ListFilters>,
): ListParams {
  return { ...params, ...changes, page: 1 };
}

// Whether any filter besides "My replays" is set.
export function hasFilters(params: ListParams): boolean {
  return (
    textKeys.some((key) => params[key].trim() !== "") ||
    params.user !== null ||
    params.format !== null ||
    params.from !== null ||
    params.to !== null
  );
}

// The query string for GET /api/replays. "From" starts at local midnight on
// that day, and "To" ends at local midnight after its day, so both days are
// included whole.
export function replayListQuery(params: ListParams): URLSearchParams {
  const query = new URLSearchParams({ page: String(params.page) });
  if (params.mine) {
    query.set("mine", "true");
  }
  if (params.user !== null) {
    query.set("user", params.user);
  }
  for (const key of textKeys) {
    if (params[key].trim() !== "") {
      query.set(key, params[key]);
    }
  }
  if (params.format !== null) {
    query.set("format", params.format);
  }
  if (params.from !== null) {
    query.set("uploadedFrom", localMidnight(params.from, 0));
  }
  if (params.to !== null) {
    query.set("uploadedBefore", localMidnight(params.to, 1));
  }
  return query;
}

// The Replays page filtered to exactly this user's uploads.
export function userReplaysPath(username: string): string {
  return `/replays?${listSearchParams({ ...defaults, user: username })}`;
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

// A YYYY-MM-DD day that exists in the calendar, or null.
function parseDay(value: string | undefined): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) {
    return null;
  }
  const [year, month, day] = match.slice(1).map(Number) as [
    number,
    number,
    number,
  ];
  const date = localDate(year, month - 1, day);
  const exists =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;
  return exists ? value! : null;
}

// Local midnight at the start of `day` plus `addDays`, as an ISO instant.
function localMidnight(day: string, addDays: number): string {
  const [year, month, date] = day.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return localDate(year, month - 1, date + addDays).toISOString();
}

// Local midnight on a day. Unlike `new Date(year, …)`, years 0–99 aren't
// taken as 1900–1999, which matters while a year is being typed into a date
// field.
function localDate(year: number, monthIndex: number, day: number): Date {
  const date = new Date(0);
  date.setFullYear(year, monthIndex, day);
  date.setHours(0, 0, 0, 0);
  return date;
}
