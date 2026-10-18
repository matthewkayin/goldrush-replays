import { Alert, Box, Link, Paper, Typography } from "@mui/material";
import { Link as RouterLink, useParams } from "react-router";
import type { UserProfile } from "@goldrush/shared";
import { ApiError } from "../../api/client.ts";
import { useProfile } from "../../api/users.ts";
import { NotFoundPage } from "../NotFoundPage.tsx";
import { PublicReplayTable } from "../replays/ReplayTable.tsx";
import { userReplaysPath } from "../replays/page-param.ts";
import { formatAverageApm, formatWinRate } from "./profile-display.ts";

// A user's public profile (`/users/:username`): their stats from their
// processed uploads, their newest processed replays, and a link to all of
// them on the Replays page. An unknown username shows the Not Found page.
export function ProfilePage() {
  const { username = "" } = useParams();
  const profile = useProfile(username);

  if (profile.isPending) {
    return <Typography>Loading…</Typography>;
  }
  if (!profile.data) {
    return profile.error instanceof ApiError && profile.error.status === 404 ? (
      <NotFoundPage />
    ) : (
      <Alert severity="error">{profile.error?.message}</Alert>
    );
  }
  return <Profile profile={profile.data} />;
}

function Profile({ profile }: { profile: UserProfile }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Typography variant="h4" component="h1">
        {profile.username}
      </Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
        <Stat label="Games" value={String(profile.games)} />
        <Stat label="Wins" value={String(profile.wins)} />
        <Stat label="Losses" value={String(profile.losses)} />
        <Stat label="Win rate" value={formatWinRate(profile.winRate)} />
        <Stat
          label="Average APM"
          value={formatAverageApm(profile.averageApm)}
        />
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <Box sx={{ display: "flex", alignItems: "baseline", gap: 2 }}>
          <Typography variant="h5" component="h2" sx={{ flexGrow: 1 }}>
            Recent replays
          </Typography>
          <Link component={RouterLink} to={userReplaysPath(profile.username)}>
            See all replays
          </Link>
        </Box>
        {profile.recentReplays.length === 0 ? (
          <Typography>No processed replays yet.</Typography>
        ) : (
          <Paper>
            <PublicReplayTable replays={profile.recentReplays} showResult />
          </Paper>
        )}
      </Box>
    </Box>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Paper sx={{ px: 3, py: 2, minWidth: 120 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h5">{value}</Typography>
    </Paper>
  );
}
