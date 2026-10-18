// Where a profile is, and how its stats are shown.

export function profilePath(username: string): string {
  return `/users/${encodeURIComponent(username)}`;
}

// Win rate and average APM are null for a user with no processed replays.

export function formatWinRate(winRate: number | null): string {
  return winRate === null ? "—" : `${Math.round(winRate * 100)}%`;
}

export function formatAverageApm(averageApm: number | null): string {
  return averageApm === null ? "—" : averageApm.toFixed(1);
}
