import { Chip } from "@mui/material";
import type { ReplayStatus } from "@goldrush/shared";
import { statusDisplay } from "./replay-display.ts";

export function StatusChip({ status }: { status: ReplayStatus }) {
  const { label, color } = statusDisplay[status];
  return <Chip size="small" label={label} color={color} />;
}
