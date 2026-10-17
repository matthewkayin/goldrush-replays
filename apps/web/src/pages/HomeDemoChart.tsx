import { Paper, Typography } from "@mui/material";
import { LineChart, lineClasses } from "@mui/x-charts/LineChart";
import { ChartsReferenceLine } from "@mui/x-charts/ChartsReferenceLine";
import { formatSeconds, playerColors } from "../display.ts";
import { colors } from "../theme.ts";
import { minuteTicks } from "./match/match-data.ts";

// Made-up army values for a 16-minute 1v1, one sample every 30 seconds. Red
// leads early, loses most of its army in a fight at 9:00, and never recovers.
const blueArmyValue = [
  0, 0, 0, 0, 50, 100, 150, 250, 350, 450, 550, 700, 850, 1000, 1200, 1400,
  1600, 1800, 2000, 1650, 1700, 1950, 2250, 2550, 2850, 3150, 3450, 3700, 3950,
  4200, 4400, 4600, 4800,
];
const redArmyValue = [
  0, 0, 0, 100, 250, 400, 600, 800, 1000, 1250, 1500, 1750, 1950, 2150, 2350,
  2500, 2650, 2800, 2900, 900, 800, 950, 1100, 1250, 1400, 1500, 1650, 1750,
  1800, 1900, 1950, 2000, 2050,
];
const times = blueArmyValue.map((_, index) => index * 30);
const lastSecond = times.at(-1) ?? 0;
const fightSecond = 9 * 60;

// An example chart on the home page, so new players see what the match page
// shows before they upload anything.
export function HomeDemoChart() {
  return (
    <Paper component="section" sx={{ p: { xs: 2, sm: 4 } }}>
      <Typography variant="h4" component="h2" gutterBottom>
        Spot the moment the game turned
      </Typography>
      <Typography color="text.secondary">
        Army value over time
      </Typography>
      <LineChart
        height={320}
        xAxis={[
          {
            data: times,
            scaleType: "linear",
            min: 0,
            max: lastSecond,
            tickInterval: minuteTicks(lastSecond),
            valueFormatter: (seconds: number) => formatSeconds(seconds),
          },
        ]}
        yAxis={[{ width: "auto" }]}
        series={[
          {
            label: "You (Blue)",
            color: playerColors.blue,
            data: blueArmyValue,
          },
          {
            label: "Opponent (Red)",
            color: playerColors.red,
            data: redArmyValue,
          },
        ].map((line) => ({
          ...line,
          area: true,
          showMark: false,
          curve: "monotoneX" as const,
        }))}
        sx={{
          [`& .${lineClasses.area}`]: { fillOpacity: 0.15 },
          [`& .${lineClasses.line}`]: { strokeWidth: 3 },
        }}
      >
        <ChartsReferenceLine
          x={fightSecond}
          labelAlign="start"
          lineStyle={{ stroke: colors.brown, strokeDasharray: "6 4" }}
          labelStyle={{ fill: colors.darkMaroon, fontWeight: "bold" }}
        />
      </LineChart>
      <Typography variant="caption" color="text.secondary">
        Example data
      </Typography>
    </Paper>
  );
}
