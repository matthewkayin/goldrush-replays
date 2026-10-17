import { Alert, Box, CircularProgress, Typography } from "@mui/material";
import { useParams } from "react-router";
import type { Replay } from "@goldrush/shared";
import { ApiError } from "../../api/client.ts";
import { useMatch, useMatchAnalysis } from "../../api/matches.ts";
import { KillTrades } from "./KillTrades.tsx";
import { MatchCharts } from "./MatchCharts.tsx";
import { MatchOverview } from "./MatchOverview.tsx";
import { PlayerSummaries, UnitsByType } from "./PlayerStats.tsx";
import { Timelines } from "./Timelines.tsx";

// The public page for one match (`/matches/:id`). The overview shows at
// every status; the analysis loads once the worker has processed the
// replay, and the page polls until then.
export function MatchPage() {
  const { id } = useParams();
  const replayId = Number(id);
  if (!Number.isInteger(replayId) || replayId <= 0) {
    return <MatchNotFound />;
  }
  // Keyed so moving between matches starts from a clean state.
  return <Match key={replayId} replayId={replayId} />;
}

function Match({ replayId }: { replayId: number }) {
  const match = useMatch(replayId);
  const replay = match.data;

  if (match.isPending) {
    return <Loading />;
  }
  if (!replay) {
    return match.error instanceof ApiError && match.error.status === 404 ? (
      <MatchNotFound />
    ) : (
      <Alert severity="error">{match.error?.message}</Alert>
    );
  }
  return (
    <>
      <MatchOverview replay={replay} />
      <MatchBody replay={replay} />
    </>
  );
}

function MatchBody({ replay }: { replay: Replay }) {
  const analysis = useMatchAnalysis(replay.id, replay);

  switch (replay.status) {
    case "awaiting_player":
      return (
        <Alert severity="info">
          The uploader hasn't said which player they were yet. The analysis
          starts once they do.
        </Alert>
      );
    case "queued":
    case "processing":
      return (
        <Alert severity="info" icon={<CircularProgress size={20} />}>
          {replay.status === "queued"
            ? "Waiting to be analyzed."
            : "Analyzing the match."}{" "}
          This page updates when the analysis is ready.
        </Alert>
      );
    case "failed":
      return (
        <Alert severity="error">
          The analysis failed: {replay.error ?? "unknown error"}
        </Alert>
      );
    case "processed":
      if (analysis.error) {
        return <Alert severity="error">{analysis.error.message}</Alert>;
      }
      if (!analysis.data) {
        return <Loading />;
      }
      return (
        <>
          <PlayerSummaries analysis={analysis.data} />
          <MatchCharts analysis={analysis.data} />
          <Timelines analysis={analysis.data} />
          <UnitsByType analysis={analysis.data} />
          <KillTrades analysis={analysis.data} />
        </>
      );
  }
}

function Loading() {
  return (
    <Box sx={{ display: "flex", justifyContent: "center", my: 4 }}>
      <CircularProgress />
    </Box>
  );
}

function MatchNotFound() {
  return (
    <Typography variant="h5" component="h1">
      Match not found
    </Typography>
  );
}
