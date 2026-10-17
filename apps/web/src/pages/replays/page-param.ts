import { replayListQuerySchema } from "@goldrush/shared";

// The list page from the `?page=` parameter, with the same rules as the
// server: page 1 when it's missing, and also when it isn't a page number.
export function pageFromSearchParam(raw: string | null): number {
  const parsed = replayListQuerySchema.safeParse({ page: raw ?? undefined });
  return parsed.success ? parsed.data.page : 1;
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
