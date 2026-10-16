import { AppBar, Box, Container, Link, Toolbar } from "@mui/material";
import { Link as RouterLink, Outlet } from "react-router";
import { colors } from "../theme.ts";

// The header and page frame shared by every page.
export function Layout() {
  return (
    <>
      <AppBar position="static" elevation={0} sx={{ mb: 3 }}>
        <Toolbar sx={{ borderBottom: `2px solid ${colors.brown}` }}>
          <Link
            component={RouterLink}
            to="/"
            underline="none"
            variant="h5"
            sx={{ color: colors.yellow, textShadow: "2px 2px 4px #000b" }}
          >
            Gold Rush Replays
          </Link>
          <Box sx={{ flexGrow: 1 }} />
          {/* Navigation and sign-in state go here. */}
        </Toolbar>
      </AppBar>
      <Container>
        <Outlet />
      </Container>
    </>
  );
}
