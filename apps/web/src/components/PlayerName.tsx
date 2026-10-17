import { Box, Typography } from "@mui/material";
import type { MatchPlayer } from "@goldrush/shared";
import { playerColors, teamName } from "../display.ts";

// A player's name with a swatch of their in-game color, so they can be
// matched to their lines on the match page's charts. `showTeam` adds their
// team, for lists that don't have a team column.
export function PlayerName({
  player,
  showTeam = false,
}: {
  player: Pick<MatchPlayer, "name" | "color" | "team">;
  showTeam?: boolean;
}) {
  return (
    <Box
      component="span"
      sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}
    >
      <Box
        component="span"
        aria-hidden
        sx={{
          width: 12,
          height: 12,
          borderRadius: "2px",
          border: "1px solid #0006",
          backgroundColor: playerColors[player.color],
          flexShrink: 0,
        }}
      />
      {player.name}
      {showTeam && (
        <Typography component="span" variant="body2" color="text.secondary">
          {teamName(player.team)}
        </Typography>
      )}
    </Box>
  );
}
