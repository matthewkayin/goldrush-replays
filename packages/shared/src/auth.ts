// Contracts for the /api/auth endpoints: register, sign in, sign out and
// the current user.
import { z } from "zod";

// Short and URL-safe, so a username can appear in a profile URL later.
export const usernameSchema = z
  .string()
  .regex(
    /^[A-Za-z0-9_-]{3,20}$/,
    "Username must be 3 to 20 characters: letters, digits, _ or -",
  );

// The maximum bounds the cost of hashing a submitted password.
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(256, "Password must be at most 256 characters");

export const registerRequestSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

// Looser than registration on purpose: a failed sign-in never explains the
// rules, it is only ever "Invalid username or password".
export const signInRequestSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1).max(256),
});
export type SignInRequest = z.infer<typeof signInRequestSchema>;

export const userSchema = z.object({
  id: z.number().int(),
  username: z.string(),
});
export type User = z.infer<typeof userSchema>;

// Returned by register and sign-in, which both sign the user in.
export const authResponseSchema = z.object({
  user: userSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

// Returned by GET /api/auth/me and sign-out. `user` is null when signed out.
export const currentUserResponseSchema = z.object({
  user: userSchema.nullable(),
});
export type CurrentUserResponse = z.infer<typeof currentUserResponseSchema>;
