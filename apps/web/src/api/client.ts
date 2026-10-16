// The only place the web app calls fetch. Every response is checked against
// a Zod schema from @goldrush/shared, and every failure becomes an ApiError.
import { apiErrorSchema } from "@goldrush/shared";
import type { z } from "zod";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function apiGet<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  return request(path, { method: "GET" }, schema);
}

// A FormData body is sent as multipart; anything else is sent as JSON.
export function apiPost<T>(
  path: string,
  body: unknown,
  schema: z.ZodType<T>,
): Promise<T> {
  const init: RequestInit =
    body instanceof FormData
      ? { method: "POST", body }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        };
  return request(path, init, schema);
}

async function request<T>(
  path: string,
  init: RequestInit,
  schema: z.ZodType<T>,
): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    throw new ApiError(response.status, await errorMessage(response));
  }
  return schema.parse(await response.json());
}

async function errorMessage(response: Response): Promise<string> {
  const body = apiErrorSchema.safeParse(
    await response.json().catch(() => null),
  );
  return body.success
    ? body.data.message
    : `Request failed (${response.status})`;
}
