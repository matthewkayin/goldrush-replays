import {
  Alert,
  Box,
  Link,
  Pagination,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { Link as RouterLink, useSearchParams } from "react-router";
import type { Replay } from "@goldrush/shared";
import { useReplayPage } from "../../api/replays.ts";
import { PlayerName } from "../../components/PlayerName.tsx";
import { PlayerPicker } from "./PlayerPicker.tsx";
import { StatusChip } from "./StatusChip.tsx";
import { pageCount, pageFromSearchParam } from "./page-param.ts";
import { mapNames } from "../../display.ts";
import { formatDuration, uploaderResultLabel } from "./replay-display.ts";

const columnCount = 6;

// The signed-in user's replays, newest first, one page at a time. The page
// is kept in `?page=`, and the list polls while any replay on it is being
// analyzed (useReplayPage).
export function ReplaysPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = pageFromSearchParam(searchParams.get("page"));
  const { data, error, isPending } = useReplayPage(page);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Typography variant="h4" component="h1">
        My replays
      </Typography>
      {error && <Alert severity="error">{error.message}</Alert>}
      {isPending && <Typography>Loading…</Typography>}
      {data && data.total === 0 && (
        <Typography>
          You haven't uploaded any replays yet.{" "}
          <Link component={RouterLink} to="/upload">
            Upload one
          </Link>
          .
        </Typography>
      )}
      {data && data.total > 0 && (
        <>
          <Paper>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Uploaded</TableCell>
                  <TableCell>Map</TableCell>
                  <TableCell>Players</TableCell>
                  <TableCell>Duration</TableCell>
                  <TableCell>Result</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.replays.map((replay) => (
                  <ReplayRows key={replay.id} replay={replay} />
                ))}
              </TableBody>
            </Table>
          </Paper>
          <Pagination
            count={pageCount(data.total, data.pageSize)}
            page={page}
            onChange={(_event, next) =>
              setSearchParams(next === 1 ? {} : { page: String(next) })
            }
          />
        </>
      )}
    </Box>
  );
}

// A replay's row, plus a row under it when it needs a player choice or its
// analysis failed.
function ReplayRows({ replay }: { replay: Replay }) {
  const needsPlayer = replay.status === "awaiting_player";
  const failed = replay.status === "failed";
  // Without this, the main row's bottom border would split it from the
  // row under it.
  const hasRowBelow = needsPlayer || failed;

  return (
    <>
      <TableRow
        sx={{ "& > td": { borderBottom: hasRowBelow ? "none" : undefined } }}
      >
        <TableCell>
          <Link component={RouterLink} to={`/matches/${replay.id}`}>
            {new Date(replay.uploadedAt).toLocaleString()}
          </Link>
          <Typography variant="body2" color="text.secondary">
            {replay.filename}
          </Typography>
        </TableCell>
        <TableCell>{mapNames[replay.mapType]}</TableCell>
        <TableCell>
          <Box sx={{ display: "flex", flexDirection: "column" }}>
            {replay.players.map((player) => (
              <PlayerName key={player.slot} player={player} showTeam />
            ))}
          </Box>
        </TableCell>
        <TableCell>{formatDuration(replay.durationTicks)}</TableCell>
        <TableCell>{uploaderResultLabel(replay)}</TableCell>
        <TableCell>
          <StatusChip status={replay.status} />
        </TableCell>
      </TableRow>
      {needsPlayer && (
        <TableRow>
          <TableCell colSpan={columnCount}>
            <PlayerPicker replay={replay} />
          </TableCell>
        </TableRow>
      )}
      {failed && (
        <TableRow>
          <TableCell colSpan={columnCount}>
            <Alert severity="error">
              Analysis failed: {replay.error ?? "unknown error"}
            </Alert>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
