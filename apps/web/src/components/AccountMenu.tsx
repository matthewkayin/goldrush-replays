import { Box, Button, Typography } from "@mui/material";
import { Link as RouterLink, useNavigate } from "react-router";
import { useCurrentUser, useSignOut } from "../api/auth.ts";
import { colors } from "../theme.ts";

// The right end of the header: sign-in and register links for visitors, or
// the username and a sign-out button for a signed-in user.
export function AccountMenu() {
  const { data: user, isPending } = useCurrentUser();
  const signOut = useSignOut();
  const navigate = useNavigate();

  if (isPending) {
    return null;
  }
  if (!user) {
    return (
      <Box sx={{ display: "flex", gap: 1 }}>
        <Button color="inherit" component={RouterLink} to="/sign-in">
          Sign in
        </Button>
        <Button color="inherit" component={RouterLink} to="/register">
          Register
        </Button>
      </Box>
    );
  }
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
      <Typography sx={{ color: colors.yellow }}>{user.username}</Typography>
      <Button
        color="inherit"
        disabled={signOut.isPending}
        onClick={() =>
          signOut.mutate(undefined, { onSuccess: () => navigate("/") })
        }
      >
        Sign out
      </Button>
    </Box>
  );
}
