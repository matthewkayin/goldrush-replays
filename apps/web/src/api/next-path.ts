// The `?next=` parameter on the sign-in and register pages says where to go
// after signing in. Only same-site paths are followed, so a link can't use
// the sign-in page to send someone to another site.
export function safeNextPath(raw: string | null): string {
  if (
    raw &&
    raw.startsWith("/") &&
    !raw.startsWith("//") &&
    !raw.startsWith("/\\")
  ) {
    return raw;
  }
  return "/";
}

// A link to the sign-in or register page that comes back to `next`.
export function authPagePath(
  page: "/sign-in" | "/register",
  next: string,
): string {
  return next === "/" ? page : `${page}?next=${encodeURIComponent(next)}`;
}
