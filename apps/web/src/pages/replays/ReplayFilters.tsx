import { useEffect, useState } from "react";
import { Box, Button, MenuItem, TextField } from "@mui/material";
import { matchFormatSchema, type MatchFormat } from "@goldrush/shared";
import {
  hasFilters,
  noFilters,
  type ListFilters,
  type ListParams,
} from "./page-param.ts";

// How long typing pauses before a text filter is applied.
const textDebounceMs = 300;

// The filter bar above the replay list. Every change is reported through
// `onChange`, which puts it in the URL.
export function ReplayFilters({
  params,
  onChange,
}: {
  params: ListParams;
  onChange: (changes: Partial<ListFilters>) => void;
}) {
  return (
    <Box
      sx={{ display: "flex", flexWrap: "wrap", gap: 2, alignItems: "center" }}
    >
      <TextFilter
        label="Uploader"
        value={params.uploader}
        onChange={(uploader) => onChange({ uploader })}
      />
      <TextFilter
        label="Filename"
        value={params.filename}
        onChange={(filename) => onChange({ filename })}
      />
      <TextFilter
        label="Player"
        value={params.player}
        onChange={(player) => onChange({ player })}
      />
      <TextField
        select
        size="small"
        label="Format"
        value={params.format ?? ""}
        onChange={(event) =>
          onChange({ format: (event.target.value as MatchFormat) || null })
        }
        sx={{ minWidth: 110 }}
      >
        <MenuItem value="">Any</MenuItem>
        {matchFormatSchema.options.map((format) => (
          <MenuItem key={format} value={format}>
            {format}
          </MenuItem>
        ))}
      </TextField>
      {/* Replays carry no match date, so this is the upload date. */}
      <DayFilter
        label="Uploaded from"
        value={params.from}
        onChange={(from) => onChange({ from })}
      />
      <DayFilter
        label="Uploaded to"
        value={params.to}
        onChange={(to) => onChange({ to })}
      />
      {hasFilters(params) && (
        <Button onClick={() => onChange(noFilters)}>Clear filters</Button>
      )}
    </Box>
  );
}

// A text field that applies its value once typing pauses, so the list isn't
// fetched on every keystroke. When the value changes from outside (the back
// button, "Clear filters"), the field shows the new value.
function TextFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [appliedValue, setAppliedValue] = useState(value);
  if (value !== appliedValue) {
    setAppliedValue(value);
    setDraft(value);
  }

  useEffect(() => {
    if (draft === value) {
      return;
    }
    const timer = setTimeout(() => onChange(draft), textDebounceMs);
    return () => clearTimeout(timer);
  }, [draft, value, onChange]);

  return (
    <TextField
      size="small"
      label={label}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      slotProps={{ htmlInput: { maxLength: 100 } }}
      sx={{ width: 160 }}
    />
  );
}

// A day picker for one end of the upload date range. Empty means that end
// is open.
function DayFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <TextField
      type="date"
      size="small"
      label={label}
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value || null)}
      slotProps={{ inputLabel: { shrink: true } }}
    />
  );
}
