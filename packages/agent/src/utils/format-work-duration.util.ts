/** "850ms", "42s" or "3m 15s"; null when the duration is unknown. */
export function formatWorkDuration(durationMs: number | null): string | null {
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs < 0) {
    return null;
  }

  if (durationMs < 1000) {
    return `${Math.max(0, Math.round(durationMs))}ms`;
  }

  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes <= 0) {
    return `${totalSeconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}
