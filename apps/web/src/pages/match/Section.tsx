import type { ReactNode } from "react";
import { Paper, Typography } from "@mui/material";

// A titled panel; the match page is a column of these.
export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Paper component="section" sx={{ p: 2, mb: 3 }}>
      <Typography variant="h6" component="h2" gutterBottom>
        {title}
      </Typography>
      {children}
    </Paper>
  );
}
