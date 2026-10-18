import {
  Box,
  Button,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { Link as RouterLink } from "react-router";
import type { Replay } from "@goldrush/shared";
import { replayDownloadPath } from "../../api/matches.ts";
import { PlayerName } from "../../components/PlayerName.tsx";
import { profilePath } from "../profile/profile-display.ts";
import { formatTick, mapNames, teamName } from "../../display.ts";
import { describeWinner } from "./match-data.ts";

// The match header: map, duration, upload date and uploader, winner, the
// download link, and the players with their teams and results. Shown at every status; results and
// duration appear once the replay is processed.
export function MatchOverview({ replay }: { replay: Replay }) {
  const winner = describeWinner(replay.players);
  return (
    <Paper component="section" sx={{ p: 2, mb: 3 }}>
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 2,
          mb: 1,
        }}
      >
        <Typography
          variant="h5"
          component="h1"
          sx={{ flexGrow: 1, wordBreak: "break-word" }}
        >
          {replay.filename}
        </Typography>
        <Button
          variant="contained"
          href={replayDownloadPath(replay.id)}
          download={replay.filename}
        >
          Download
        </Button>
      </Box>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 2 }}>
        <Chip label={mapNames[replay.mapType]} />
        {replay.durationTicks !== null && (
          <Chip label={`Duration ${formatTick(replay.durationTicks)}`} />
        )}
        <Chip
          label={`Uploaded ${new Date(replay.uploadedAt).toLocaleString()}`}
        />
        <Chip
          clickable
          component={RouterLink}
          to={profilePath(replay.uploaderUsername)}
          label={`Uploaded by ${replay.uploaderUsername}`}
        />
        {winner && <Chip color="primary" label={winner} />}
      </Box>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Player</TableCell>
            <TableCell>Team</TableCell>
            <TableCell>Result</TableCell>
            <TableCell>Defeated or left at</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {replay.players.map((player) => (
            <TableRow key={player.slot}>
              <TableCell>
                <PlayerName player={player} />
                {player.slot === replay.uploaderSlot && (
                  <Chip
                    size="small"
                    variant="outlined"
                    label="Uploader"
                    sx={{ ml: 1 }}
                  />
                )}
              </TableCell>
              <TableCell>{teamName(player.team)}</TableCell>
              <TableCell>{resultLabel(player.result)}</TableCell>
              <TableCell>
                {player.defeatedAtTick === null
                  ? "—"
                  : formatTick(player.defeatedAtTick)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );
}

function resultLabel(result: Replay["players"][number]["result"]): string {
  switch (result) {
    case "win":
      return "Win";
    case "loss":
      return "Loss";
    case null:
      return "—";
  }
}
