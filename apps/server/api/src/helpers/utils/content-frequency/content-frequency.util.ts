const HOURLY_MS = 3_600_000;
const TWICE_DAILY_MS = 43_200_000;
const DAILY_MS = 86_400_000;
const WEEKLY_MS = 604_800_000;

/**
 * Convert a `contentStrategy.frequency` string to milliseconds.
 *
 * Lives outside the orchestration and workflow services so both can read the
 * same cadence without importing each other — the import cycle that broke
 * `ContentOrchestrationService` dependency resolution.
 */
export function parseFrequencyToMs(frequency?: string): number {
  switch (frequency?.toLowerCase()) {
    case 'hourly':
      return HOURLY_MS;
    case 'twice-daily':
      return TWICE_DAILY_MS;
    case 'daily':
      return DAILY_MS;
    case 'weekly':
      return WEEKLY_MS;
    default:
      return DAILY_MS;
  }
}
