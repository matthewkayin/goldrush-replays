import { useMemo, useState } from "react";
import { Box, Button, Chip, Typography } from "@mui/material";
import { LineChart } from "@mui/x-charts/LineChart";
import type { Analysis } from "@goldrush/shared";
import { PlayerName } from "../../components/PlayerName.tsx";
import { formatSeconds } from "../../display.ts";
import {
  matchCharts,
  minuteTicks,
  withoutPlayers,
  type TimeChart,
} from "./match-data.ts";
import { Section } from "./Section.tsx";

// Every time-series chart, two to a row on wide screens. Players can be
// hidden from all of them at once with the toggles above.
export function MatchCharts({ analysis }: { analysis: Analysis }) {
  const charts = useMemo(() => matchCharts(analysis), [analysis]);
  const [hiddenSlots, setHiddenSlots] = useState<ReadonlySet<number>>(
    new Set(),
  );

  function togglePlayer(slot: number) {
    const next = new Set(hiddenSlots);
    if (!next.delete(slot)) {
      next.add(slot);
    }
    setHiddenSlots(next);
  }

  return (
    <Section title="Over time">
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 1,
          mb: 2,
        }}
      >
        {analysis.players.map((player) => {
          const isShown = !hiddenSlots.has(player.slot);
          return (
            <Chip
              key={player.slot}
              label={<PlayerName player={player} />}
              variant={isShown ? "filled" : "outlined"}
              aria-pressed={isShown}
              onClick={() => togglePlayer(player.slot)}
              sx={{ opacity: isShown ? 1 : 0.5 }}
            />
          );
        })}
        <Button
          size="small"
          disabled={hiddenSlots.size === 0}
          onClick={() => setHiddenSlots(new Set())}
        >
          Show all
        </Button>
      </Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
          gap: 3,
        }}
      >
        {charts.map(({ title, description, chart }) => (
          <Box key={title}>
            <Typography variant="subtitle1" component="h3">
              {title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {description}
            </Typography>
            <TimeSeriesChart chart={withoutPlayers(chart, hiddenSlots)} />
          </Box>
        ))}
      </Box>
    </Section>
  );
}

// One line per player against match time.
function TimeSeriesChart({ chart }: { chart: TimeChart }) {
  const lastSecond = chart.times.at(-1) ?? 0;
  return (
    <LineChart
      height={280}
      skipAnimation
      xAxis={[
        {
          data: chart.times,
          scaleType: "linear",
          min: 0,
          max: lastSecond,
          tickInterval: minuteTicks(lastSecond),
          valueFormatter: (seconds: number) => formatSeconds(seconds),
        },
      ]}
      yAxis={[{ width: "auto" }]}
      series={chart.lines.map((line) => ({
        id: line.id,
        label: line.label,
        color: line.color,
        data: line.data,
        showMark: false,
        curve: "linear" as const,
      }))}
    />
  );
}
