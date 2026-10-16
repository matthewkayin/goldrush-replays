import { Link, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router";

export function NotFoundPage() {
  return (
    <>
      <Typography variant="h4" gutterBottom>
        Page not found
      </Typography>
      <Link component={RouterLink} to="/">
        Back to the home page
      </Link>
    </>
  );
}
