import {
  Box,
  Link,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { Link as RouterLink } from "react-router";
import { matchFormat, type Replay } from "@goldrush/shared";
import { PlayerName } from "../../components/PlayerName.tsx";
import { UserLink } from "../../components/UserLink.tsx";
import { mapNames } from "../../display.ts";
import {
  formatDuration,
  uploaderResultLabel,
  winners,
} from "./replay-display.ts";

// The headings for CommonCells.
export function CommonHeadCells() {
  return (
    <>
      <TableCell>Uploaded</TableCell>
      <TableCell>Map</TableCell>
      <TableCell>Format</TableCell>
      <TableCell>Players</TableCell>
      <TableCell>Duration</TableCell>
    </>
  );
}

export const commonColumnCount = 5;

// The cells every replay table starts with.
export function CommonCells({ replay }: { replay: Replay }) {
  return (
    <>
      <TableCell>
        <Link component={RouterLink} to={`/matches/${replay.id}`}>
          {new Date(replay.uploadedAt).toLocaleString()}
        </Link>
        <Typography variant="body2" color="text.secondary">
          {replay.filename}
        </Typography>
      </TableCell>
      <TableCell>{mapNames[replay.mapType]}</TableCell>
      <TableCell>{matchFormat(replay.players)}</TableCell>
      <TableCell>
        <Box sx={{ display: "flex", flexDirection: "column" }}>
          {replay.players.map((player) => (
            <PlayerName key={player.slot} player={player} showTeam />
          ))}
        </Box>
      </TableCell>
      <TableCell>{formatDuration(replay.durationTicks)}</TableCell>
    </>
  );
}

// Processed replays as the public list shows them: the common cells, the
// winners and the uploader. `showResult` adds the uploader's own result,
// for a profile, where the uploader is the profile's user.
export function PublicReplayTable({
  replays,
  showResult = false,
}: {
  replays: Replay[];
  showResult?: boolean;
}) {
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <CommonHeadCells />
          <TableCell>Winners</TableCell>
          <TableCell>Uploader</TableCell>
          {showResult && <TableCell>Result</TableCell>}
        </TableRow>
      </TableHead>
      <TableBody>
        {replays.map((replay) => (
          <TableRow key={replay.id}>
            <CommonCells replay={replay} />
            <WinnersCell replay={replay} />
            <TableCell>
              <UserLink username={replay.uploaderUsername} />
            </TableCell>
            {showResult && <TableCell>{uploaderResultLabel(replay)}</TableCell>}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function WinnersCell({ replay }: { replay: Replay }) {
  const winningPlayers = winners(replay.players);
  return (
    <TableCell>
      {winningPlayers.length === 0 ? (
        "No winner"
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column" }}>
          {winningPlayers.map((player) => (
            <PlayerName key={player.slot} player={player} />
          ))}
        </Box>
      )}
    </TableCell>
  );
}
