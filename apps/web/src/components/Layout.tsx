import { AppBar, Box, Button, Container, Link, Toolbar } from "@mui/material";
import { Link as RouterLink, Outlet } from "react-router";
import { useCurrentUser } from "../api/auth.ts";
import { colors } from "../theme.ts";
import { AccountMenu } from "./AccountMenu.tsx";
import { profilePath } from "../pages/profile/profile-display.ts";

// The header and page frame shared by every page.
export function Layout() {
  const { data: user } = useCurrentUser();
  return (
    <>
      <AppBar position="static" elevation={0} sx={{ mb: 3 }}>
        <Toolbar sx={{ borderBottom: `2px solid ${colors.brown}` }}>
          <Link
            component={RouterLink}
            to="/"
            underline="none"
            variant="h5"
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              color: colors.yellow,
              textShadow: "2px 2px 4px #000b",
            }}
          >
            {/* The gold bar icon is also the favicon. */}
            <Box
              component="img"
              src="/favicon.png"
              alt=""
              sx={{ height: 32, imageRendering: "pixelated" }}
            />
            Gold Rush Replays
          </Link>
          {/* Visitors see Replays and Upload too; the upload page asks them
              to sign in. Profile is the signed-in user's own. */}
          <Box sx={{ display: "flex", gap: 1, ml: 4 }}>
            <Button color="inherit" component={RouterLink} to="/replays">
              Replays
            </Button>
            <Button color="inherit" component={RouterLink} to="/upload">
              Upload
            </Button>
            {user && (
              <Button
                color="inherit"
                component={RouterLink}
                to={profilePath(user.username)}
              >
                Profile
              </Button>
            )}
          </Box>
          <Box sx={{ flexGrow: 1 }} />
          <AccountMenu />
        </Toolbar>
      </AppBar>
      <Container>
        <Outlet />
      </Container>
    </>
  );
}
