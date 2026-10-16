// The cookie that holds a session token. httpOnly keeps it away from page
// scripts, and SameSite=Lax keeps other sites from sending it with a POST.
// It isn't `secure` because the site runs on plain http on localhost.
import type { FastifyReply, FastifyRequest } from "fastify";
import { SESSION_DURATION_MS } from "../db/sessions.ts";

export const SESSION_COOKIE = "session";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
} as const;

export function readSessionCookie(request: FastifyRequest): string | undefined {
  return request.cookies[SESSION_COOKIE];
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, {
    ...cookieOptions,
    maxAge: SESSION_DURATION_MS / 1000,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, cookieOptions);
}
