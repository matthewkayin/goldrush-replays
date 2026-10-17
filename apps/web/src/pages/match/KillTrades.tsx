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
import { killCounts, type KillCount } from "./match-data.ts";
import { PlayerName } from "../../components/PlayerName.tsx";
import { Section } from "./Section.tsx";

// Who killed whom: a row per attacking player and a column per defending
// player, counting units and buildings separately.
export function KillTrades({ analysis }: { analysis: Analysis }) {
  const counts = killCounts(analysis);
  return (
    <Section title="Kills between players">
      <Box sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Killer ↓ / killed →</TableCell>
              {analysis.players.map((defender) => (
                <TableCell key={defender.slot} align="right">
                  <PlayerName player={defender} />
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {analysis.players.map((attacker) => (
              <TableRow key={attacker.slot}>
                <TableCell>
                  <PlayerName player={attacker} />
                </TableCell>
                {analysis.players.map((defender) => (
                  <TableCell
                    key={defender.slot}
                    align="right"
                    sx={{
                      color:
                        attacker.team === defender.team
                          ? "text.secondary"
                          : undefined,
                    }}
                  >
                    {describeKills(counts[attacker.slot]![defender.slot]!)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
      <Typography variant="caption" color="text.secondary">
        Units / buildings. Kills within a team are greyed out.
      </Typography>
    </Section>
  );
}

function describeKills({ units, buildings }: KillCount): string {
  return `${units} / ${buildings}`;
}
