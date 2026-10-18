import { Link } from "@mui/material";
import { Link as RouterLink } from "react-router";
import { profilePath } from "../pages/profile/profile-display.ts";

// A site account's username, linking to their profile.
export function UserLink({ username }: { username: string }) {
  return (
    <Link component={RouterLink} to={profilePath(username)}>
      {username}
    </Link>
  );
}
