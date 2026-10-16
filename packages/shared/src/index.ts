import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

// The body of every error response from the API.
export const apiErrorSchema = z.object({
  message: z.string(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export * from "./analyzer.ts";
