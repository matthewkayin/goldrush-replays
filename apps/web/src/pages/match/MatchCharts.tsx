import { useMemo } from "react";
import { Box, Typography } from "@mui/material";
import { LineChart, lineClasses } from "@mui/x-charts/LineChart";
import type { Analysis } from "@goldrush/shared";
import { formatSeconds } from "../../display.ts";
import { matchCharts, minuteTicks, type TimeChart } from "./match-data.ts";
import { Section } from "./Section.tsx";

// Every time-series chart, two to a row on wide screens.
export function MatchCharts({ analysis }: { analysis: Analysis }) {
  const charts = useMemo(() => matchCharts(analysis), [analysis]);
  return (
    <Section title="Over time">
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
            <TimeSeriesChart chart={chart} />
          </Box>
        ))}
      </Box>
    </Section>
  );
}

// One line per player (or two, for population) against match time.
function TimeSeriesChart({ chart }: { chart: TimeChart }) {
  // Dashed lines are picked out by the series id MUI puts on each path.
  const dashedLines = Object.fromEntries(
    chart.lines
      .filter((line) => line.dashed)
      .map((line) => [
        `& .${lineClasses.line}[data-series="${line.id}"]`,
        { strokeDasharray: "6 4" },
      ]),
  );
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
      sx={dashedLines}
    />
  );
}
