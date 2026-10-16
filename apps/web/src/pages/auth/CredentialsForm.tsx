import { useState, type FormEvent, type ReactNode } from "react";
import {
  Alert,
  Box,
  Button,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import type { z } from "zod";

export interface Credentials {
  username: string;
  password: string;
}

interface CredentialsFormProps {
  title: string;
  submitLabel: string;
  // Checked before submitting; its messages show under the fields.
  schema: z.ZodType<Credentials>;
  passwordAutoComplete: "current-password" | "new-password";
  onSubmit: (credentials: Credentials) => void;
  isSubmitting: boolean;
  // The server's error from the last submit, if any.
  error: Error | null;
  // Shown under the form, e.g. a link to the other auth page.
  footer: ReactNode;
}

type FieldErrors = Partial<Record<keyof Credentials, string>>;

// The username and password form shared by the sign-in and register pages.
export function CredentialsForm({
  title,
  submitLabel,
  schema,
  passwordAutoComplete,
  onSubmit,
  isSubmitting,
  error,
  footer,
}: CredentialsFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = schema.safeParse({ username, password });
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof Credentials;
        errors[field] ??= issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    onSubmit(parsed.data);
  }

  return (
    <Paper sx={{ maxWidth: 400, mx: "auto", p: 3 }}>
      <Typography variant="h5" component="h1" gutterBottom>
        {title}
      </Typography>
      <Box
        component="form"
        onSubmit={handleSubmit}
        noValidate
        sx={{ display: "flex", flexDirection: "column", gap: 2 }}
      >
        {error && <Alert severity="error">{error.message}</Alert>}
        <TextField
          label="Username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          autoFocus
          required
          error={fieldErrors.username !== undefined}
          helperText={fieldErrors.username}
        />
        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={passwordAutoComplete}
          required
          error={fieldErrors.password !== undefined}
          helperText={fieldErrors.password}
        />
        <Button type="submit" variant="contained" disabled={isSubmitting}>
          {submitLabel}
        </Button>
        <Typography variant="body2">{footer}</Typography>
      </Box>
    </Paper>
  );
}
