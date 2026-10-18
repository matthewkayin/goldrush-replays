import { useState } from "react";
import { useDropzone } from "react-dropzone";
import { Alert, Box, Link, Paper, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router";
import type { Replay, UploadResult } from "@goldrush/shared";
import { useUploadReplays } from "../../api/replays.ts";
import { PlayerName } from "../../components/PlayerName.tsx";
import { mapNames } from "../../display.ts";
import { PlayerPicker } from "../replays/PlayerPicker.tsx";
import { colors } from "../../theme.ts";
import { checkReplayFiles } from "./check-files.ts";

// Upload .rep files, then say which player you were in each. Results from
// every drop stay on the page, in the order the files were dropped.
export function UploadPage() {
  const [results, setResults] = useState<UploadResult[]>([]);
  const upload = useUploadReplays();

  function handleFiles(files: File[]) {
    const { toUpload, rejected } = checkReplayFiles(files);
    setResults((current) => [...current, ...rejected]);
    if (toUpload.length > 0) {
      upload.mutate(toUpload, {
        onSuccess: (uploaded) =>
          setResults((current) => [...current, ...uploaded]),
      });
    }
  }

  // Swaps in the replay the server returned after a player was chosen.
  function replaceReplay(updated: Replay) {
    setResults((current) =>
      current.map((result) =>
        result.outcome === "accepted" && result.replay.id === updated.id
          ? { ...result, replay: updated }
          : result,
      ),
    );
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    // The dropzone's own rejections (wrong extension) still go through
    // checkReplayFiles, so they're listed with a reason too.
    onDrop: (accepted, rejections) =>
      handleFiles([...accepted, ...rejections.map(({ file }) => file)]),
    accept: { "application/octet-stream": [".rep"] },
    disabled: upload.isPending,
  });

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Typography variant="h4" component="h1">
        Upload replays
      </Typography>
      <Paper
        {...getRootProps()}
        sx={{
          p: 4,
          textAlign: "center",
          cursor: upload.isPending ? "default" : "pointer",
          border: `2px dashed ${isDragActive ? colors.maroon : colors.brown}`,
        }}
      >
        <input {...getInputProps()} />
        <Typography>
          {upload.isPending
            ? "Uploading…"
            : "Drop .rep files here, or click to choose them."}
        </Typography>
      </Paper>
      {upload.error && <Alert severity="error">{upload.error.message}</Alert>}
      {results.map((result, index) => (
        // Results are only ever appended, so the index is a stable key.
        <UploadResultCard
          key={index}
          result={result}
          onChosen={replaceReplay}
        />
      ))}
      <Typography>
        <Link component={RouterLink} to="/replays?mine=true">
          Go to My replays
        </Link>
      </Typography>
    </Box>
  );
}

function UploadResultCard({
  result,
  onChosen,
}: {
  result: UploadResult;
  onChosen: (replay: Replay) => void;
}) {
  if (result.outcome === "rejected") {
    return (
      <Alert severity="error">
        <strong>{result.filename}</strong> was rejected: {result.reason}
      </Alert>
    );
  }
  const { replay } = result;
  return (
    <Paper sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1 }}>
      <Typography variant="h6" component="h2">
        {result.filename}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {mapNames[replay.mapType]}
      </Typography>
      {replay.status === "awaiting_player" ? (
        <PlayerPicker replay={replay} onChosen={onChosen} />
      ) : (
        <>
          <Box sx={{ display: "flex", flexDirection: "column" }}>
            {replay.players.map((player) => (
              <PlayerName key={player.slot} player={player} showTeam />
            ))}
          </Box>
          <Typography variant="body2">
            Queued for analysis.{" "}
            <Link component={RouterLink} to={`/matches/${replay.id}`}>
              View match
            </Link>
          </Typography>
        </>
      )}
    </Paper>
  );
}
