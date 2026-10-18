import {
  Alert,
  Box,
  FormControlLabel,
  Link,
  Pagination,
  Paper,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { Link as RouterLink, useSearchParams } from "react-router";
import type { Replay } from "@goldrush/shared";
import { useCurrentUser } from "../../api/auth.ts";
import { useReplayPage } from "../../api/replays.ts";
import { PlayerPicker } from "./PlayerPicker.tsx";
import { ReplayFilters } from "./ReplayFilters.tsx";
import { StatusChip } from "./StatusChip.tsx";
import {
  hasFilters,
  listParamsFromSearch,
  listSearchParams,
  pageCount,
  withFilters,
  type ListFilters,
  type ListParams,
} from "./page-param.ts";
import {
  CommonCells,
  CommonHeadCells,
  commonColumnCount,
  PublicReplayTable,
} from "./ReplayTable.tsx";
import { uploaderResultLabel } from "./replay-display.ts";

// Processed replays from every uploader, newest upload first, one page at a
// time. A signed-in user can turn on "My replays" to see only their own, at
// every status, with the choose-player prompt and failed errors; that view
// polls while any replay on it is being analyzed (useReplayPage). Anyone
// can filter either list. The page, the toggle and the filters are kept in
// the URL (page-param.ts), and any change to them goes back to page 1.
export function ReplaysPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlParams = listParamsFromSearch(searchParams);
  const { data: user, isPending: userPending } = useCurrentUser();
  // Visitors always get the public list. While the user is loading, trust
  // the URL so a signed-in user's "My replays" isn't fetched twice.
  const mine = urlParams.mine && (userPending || user !== null);
  const params = { ...urlParams, mine };
  const { data, error, isPending, isPlaceholderData } = useReplayPage(params);
  const showList = (next: ListParams) =>
    setSearchParams(listSearchParams(next));
  const changeFilters = (changes: Partial<ListFilters>) =>
    showList(withFilters(params, changes));

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Typography variant="h4" component="h1" sx={{ flexGrow: 1 }}>
          Replays
        </Typography>
        {user && (
          <FormControlLabel
            label="My replays"
            control={
              <Switch
                checked={mine}
                // A filter change goes back to page 1.
                onChange={(_event, checked) => changeFilters({ mine: checked })}
              />
            }
          />
        )}
      </Box>
      <ReplayFilters params={params} onChange={changeFilters} />
      {error && <Alert severity="error">{error.message}</Alert>}
      {isPending && <Typography>Loading…</Typography>}
      {data && data.total === 0 && (
        <Typography>
          {hasFilters(params) ? (
            "No replays match these filters."
          ) : (
            <>
              {mine
                ? "You haven't uploaded any replays yet. "
                : "No replays have been processed yet. "}
              <Link component={RouterLink} to="/upload">
                Upload one
              </Link>
              .
            </>
          )}
        </Typography>
      )}
      {data && data.total > 0 && (
        <>
          {/* Dimmed while the previous page stands in for the one loading. */}
          <Paper sx={{ opacity: isPlaceholderData ? 0.6 : 1 }}>
            {mine ? (
              <MyReplayTable replays={data.replays} />
            ) : (
              <PublicReplayTable replays={data.replays} />
            )}
          </Paper>
          <Pagination
            count={pageCount(data.total, data.pageSize)}
            page={params.page}
            onChange={(_event, page) => showList({ ...params, page })}
          />
        </>
      )}
    </Box>
  );
}

const myColumnCount = commonColumnCount + 2;

// The user's own replays, at every status, with their result.
function MyReplayTable({ replays }: { replays: Replay[] }) {
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <CommonHeadCells />
          <TableCell>Result</TableCell>
          <TableCell>Status</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {replays.map((replay) => (
          <MyReplayRows key={replay.id} replay={replay} />
        ))}
      </TableBody>
    </Table>
  );
}

// One of the user's own replays, plus a row under it when it needs a player
// choice or its analysis failed.
function MyReplayRows({ replay }: { replay: Replay }) {
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
        <CommonCells replay={replay} />
        <TableCell>{uploaderResultLabel(replay)}</TableCell>
        <TableCell>
          <StatusChip status={replay.status} />
        </TableCell>
      </TableRow>
      {needsPlayer && (
        <TableRow>
          <TableCell colSpan={myColumnCount}>
            <PlayerPicker replay={replay} />
          </TableCell>
        </TableRow>
      )}
      {failed && (
        <TableRow>
          <TableCell colSpan={myColumnCount}>
            <Alert severity="error">
              Analysis failed: {replay.error ?? "unknown error"}
            </Alert>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
