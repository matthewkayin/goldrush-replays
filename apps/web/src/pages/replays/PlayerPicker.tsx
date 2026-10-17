import { Alert, Box, Button, Typography } from "@mui/material";
import type { Replay } from "@goldrush/shared";
import { useChoosePlayer } from "../../api/replays.ts";
import { PlayerName } from "../../components/PlayerName.tsx";

interface PlayerPickerProps {
  replay: Replay;
  // Called with the replay as the server returns it, now queued.
  onChosen?: (replay: Replay) => void;
}

// Asks which player the uploader was, one button per player. Shared by the
// upload page and "My replays".
export function PlayerPicker({ replay, onChosen }: PlayerPickerProps) {
  const choose = useChoosePlayer();

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Typography variant="body2">Which player were you?</Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
        {replay.players.map((player) => (
          <Button
            key={player.slot}
            variant="outlined"
            disabled={choose.isPending}
            onClick={() =>
              choose.mutate(
                { replayId: replay.id, slot: player.slot },
                { onSuccess: (queued) => onChosen?.(queued) },
              )
            }
            sx={{ textTransform: "none" }}
          >
            <PlayerName player={player} showTeam />
          </Button>
        ))}
      </Box>
      {choose.error && <Alert severity="error">{choose.error.message}</Alert>}
    </Box>
  );
}
