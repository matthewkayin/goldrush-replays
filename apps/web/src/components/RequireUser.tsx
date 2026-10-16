import { Navigate, Outlet, useLocation } from "react-router";
import { useCurrentUser } from "../api/auth.ts";
import { authPagePath } from "../api/next-path.ts";

// A layout route for pages that need a signed-in user. Visitors are sent to
// the sign-in page, which brings them back here afterwards. In router.tsx:
//
//   { element: <RequireUser />, children: [{ path: "/upload", ... }] }
export function RequireUser() {
  const { data: user, isPending } = useCurrentUser();
  const location = useLocation();

  if (isPending) {
    return null;
  }
  if (!user) {
    const here = location.pathname + location.search;
    return <Navigate to={authPagePath("/sign-in", here)} replace />;
  }
  return <Outlet />;
}
