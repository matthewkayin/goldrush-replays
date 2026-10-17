import { AppBar, Box, Button, Container, Link, Toolbar } from "@mui/material";
import { Link as RouterLink, Outlet } from "react-router";
import { colors } from "../theme.ts";
import { AccountMenu } from "./AccountMenu.tsx";

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
          {/* Visitors see these too; the pages ask them to sign in. */}
          <Box sx={{ display: "flex", gap: 1, mr: 2 }}>
            <Button color="inherit" component={RouterLink} to="/upload">
              Upload
            </Button>
            <Button color="inherit" component={RouterLink} to="/replays">
              My replays
            </Button>
          </Box>
          <AccountMenu />
        </Toolbar>
      </AppBar>
      <Container>
        <Outlet />
      </Container>
    </>
  );
}
