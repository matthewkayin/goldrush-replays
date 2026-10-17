import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import type { Analysis } from "@goldrush/shared";
import { formatTick } from "../../display.ts";
import { entityNames, unitCounts } from "./match-data.ts";
import { PlayerName } from "../../components/PlayerName.tsx";
import { Section } from "./Section.tsx";

// Each player's match totals, including time spent supply blocked.
export function PlayerSummaries({ analysis }: { analysis: Analysis }) {
  return (
    <Section title="Summary">
      <Box sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Player</TableCell>
              <TableCell align="right">APM</TableCell>
              <TableCell align="right">Gold mined</TableCell>
              <TableCell align="right">Peak army pop.</TableCell>
              <TableCell align="right">Peak army value</TableCell>
              <TableCell align="right">Units built</TableCell>
              <TableCell align="right">Units lost</TableCell>
              <TableCell align="right">Kills</TableCell>
              <TableCell align="right">Buildings built</TableCell>
              <TableCell align="right">Upgrades</TableCell>
              <TableCell align="right">Supply blocked</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {analysis.players.map((player) => {
              const { summary } = player;
              return (
                <TableRow key={player.slot}>
                  <TableCell>
                    <PlayerName player={player} />
                  </TableCell>
                  <TableCell align="right">{summary.apm}</TableCell>
                  <TableCell align="right">
                    {summary.gold_mined_total}
                  </TableCell>
                  <TableCell align="right">
                    {summary.peak_army_population}
                  </TableCell>
                  <TableCell align="right">{summary.peak_army_value}</TableCell>
                  <TableCell align="right">{summary.units_built}</TableCell>
                  <TableCell align="right">{summary.units_lost}</TableCell>
                  <TableCell align="right">{summary.kills}</TableCell>
                  <TableCell align="right">{summary.buildings_built}</TableCell>
                  <TableCell align="right">
                    {summary.upgrades_completed}
                  </TableCell>
                  <TableCell align="right">
                    {formatTick(summary.supply_blocked_ticks)} in{" "}
                    {summary.supply_blocked_count}{" "}
                    {summary.supply_blocked_count === 1 ? "period" : "periods"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Box>
      <Typography variant="caption" color="text.secondary">
        Kills and units lost count units only. Deaths from fire aren't counted.
      </Typography>
    </Section>
  );
}

// Units made and lost by type, one small table per player.
export function UnitsByType({ analysis }: { analysis: Analysis }) {
  return (
    <Section title="Units made and lost">
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
          <Box key={player.slot}>
            <Typography variant="subtitle1" component="h3">
              <PlayerName player={player} />
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Unit</TableCell>
                  <TableCell align="right">Made</TableCell>
                  <TableCell align="right">Lost</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {unitCounts(player).map(({ unit, built, lost }) => (
                  <TableRow key={unit}>
                    <TableCell>{entityNames[unit]}</TableCell>
                    <TableCell align="right">{built}</TableCell>
                    <TableCell align="right">{lost}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        ))}
      </Box>
      <Typography variant="caption" color="text.secondary">
        Made doesn't include the starting units.
      </Typography>
    </Section>
  );
}
