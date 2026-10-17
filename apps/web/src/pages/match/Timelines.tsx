import {
  Box,
  List,
  ListItem,
  ListItemText,
  Paper,
  Typography,
} from "@mui/material";
import type { Analysis, PlayerAnalysis } from "@goldrush/shared";
import { PlayerName } from "../../components/PlayerName.tsx";
import { formatTick } from "../../display.ts";
import {
  buildOrderFor,
  entityNames,
  isUnit,
  upgradeNames,
  upgradeTimings,
  type UpgradeTiming,
} from "./match-data.ts";
import { Section } from "./Section.tsx";

// Each player's build order and upgrades side by side, with match
// timestamps.
export function Timelines({ analysis }: { analysis: Analysis }) {
  return (
    <Section title="Build order and upgrades">
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: "1fr 1fr",
            lg: `repeat(${Math.min(analysis.players.length, 4)}, 1fr)`,
          },
          gap: 2,
        }}
      >
        {analysis.players.map((player) => (
          <PlayerTimeline
            key={player.slot}
            analysis={analysis}
            player={player}
          />
        ))}
      </Box>
    </Section>
  );
}

function PlayerTimeline({
  analysis,
  player,
}: {
  analysis: Analysis;
  player: PlayerAnalysis;
}) {
  const buildOrder = buildOrderFor(analysis, player.slot);
  const upgrades = upgradeTimings(analysis, player.slot);
  return (
    <Paper variant="outlined" sx={{ p: 1.5, backgroundColor: "transparent" }}>
      <Typography variant="subtitle1" component="h3" gutterBottom>
        <PlayerName player={player} />
      </Typography>

      <Typography variant="subtitle2" component="h4">
        Upgrades
      </Typography>
      {upgrades.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          None
        </Typography>
      ) : (
        <List dense disablePadding sx={{ mb: 1 }}>
          {upgrades.map((timing, index) => (
            <ListItem key={index} disableGutters>
              <ListItemText
                primary={upgradeNames[timing.upgrade]}
                secondary={describeUpgradeTiming(timing)}
              />
            </ListItem>
          ))}
        </List>
      )}

      <Typography variant="subtitle2" component="h4">
        Build order
      </Typography>
      <List dense disablePadding sx={{ maxHeight: 420, overflowY: "auto" }}>
        {buildOrder.map((item, index) => {
          const cancelled = item.action === "cancelled";
          return (
            <ListItem key={index} disableGutters sx={{ py: 0 }}>
              <Typography
                variant="body2"
                component="span"
                sx={{
                  width: "3.5em",
                  flexShrink: 0,
                  fontVariantNumeric: "tabular-nums",
                  color: "text.secondary",
                }}
              >
                {formatTick(item.tick)}
              </Typography>
              <Typography
                variant="body2"
                component="span"
                sx={{
                  fontWeight: isUnit(item.entity) ? undefined : "bold",
                  color: cancelled ? "text.secondary" : undefined,
                  textDecoration: cancelled ? "line-through" : undefined,
                }}
              >
                {entityNames[item.entity]}
              </Typography>
              {cancelled && (
                <Typography
                  variant="caption"
                  component="span"
                  color="text.secondary"
                  sx={{ ml: 1 }}
                >
                  cancelled
                </Typography>
              )}
            </ListItem>
          );
        })}
      </List>
      <Typography variant="caption" color="text.secondary">
        Buildings in bold
      </Typography>
    </Paper>
  );
}

function describeUpgradeTiming(timing: UpgradeTiming): string {
  const started =
    timing.purchasedAt === null
      ? "Start not recorded"
      : `Started ${formatTick(timing.purchasedAt)}`;
  const ended = timing.endedAt === null ? "" : formatTick(timing.endedAt);
  switch (timing.outcome) {
    case "completed":
      return `${started}, completed ${ended}`;
    case "cancelled":
      return `${started}, cancelled ${ended}`;
    case "researching":
      return `${started}, unfinished at the end`;
  }
}
