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
          {/* Visitors see these too; the upload page asks them to sign in. */}
          <Box sx={{ display: "flex", gap: 1, ml: 4 }}>
            <Button color="inherit" component={RouterLink} to="/replays">
              Replays
            </Button>
            <Button color="inherit" component={RouterLink} to="/upload">
              Upload
            </Button>
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
