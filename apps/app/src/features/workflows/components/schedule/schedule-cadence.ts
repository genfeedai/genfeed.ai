export interface WorkflowSchedulePreset {
  readonly cron: string;
  readonly label: string;
}

/**
 * Human cadence presets — stored as canonical cron on the workflow. Mirrors
 * the brand publishing-defaults presets so cadence language stays consistent
 * across the product.
 */
export const WORKFLOW_SCHEDULE_PRESETS: readonly WorkflowSchedulePreset[] = [
  { cron: '0 9 * * 1-5', label: 'Weekdays at 9:00 AM' },
  { cron: '0 9 * * *', label: 'Every day at 9:00 AM' },
  { cron: '0 12 * * *', label: 'Every day at noon' },
  { cron: '0 18 * * *', label: 'Every day at 6:00 PM' },
  { cron: '0 9 * * 1', label: 'Mondays at 9:00 AM' },
  { cron: '0 9,18 * * *', label: 'Twice daily (9:00 AM and 6:00 PM)' },
  { cron: '0 9 1 * *', label: 'Monthly on the 1st at 9:00 AM' },
];

export const CUSTOM_CADENCE_VALUE = 'custom';

export const DEFAULT_CUSTOM_CRON = '0 9 * * 1-5';

export function resolveCadencePresetValue(cronExpression: string): string {
  const trimmed = cronExpression.trim();
  const match = WORKFLOW_SCHEDULE_PRESETS.find(
    (preset) => preset.cron === trimmed,
  );
  return match?.label !== undefined
    ? match.cron
    : trimmed
      ? CUSTOM_CADENCE_VALUE
      : '';
}

/**
 * Human-readable cadence for display surfaces: the preset label when the
 * stored cron matches a preset, otherwise the raw cron expression.
 */
export function describeCadence(cronExpression?: string | null): string | null {
  const trimmed = cronExpression?.trim();
  if (!trimmed) {
    return null;
  }

  const preset = WORKFLOW_SCHEDULE_PRESETS.find(
    (candidate) => candidate.cron === trimmed,
  );
  return preset?.label ?? trimmed;
}

/**
 * Surface the actionable message the API sends for invalid cadence input
 * (NestJS error body or JSON:API error document) instead of a generic string.
 */
export function extractScheduleErrorMessage(
  cause: unknown,
  fallback: string,
): string {
  if (cause instanceof Error && cause.message) {
    return cause.message;
  }

  if (cause && typeof cause === 'object') {
    const record = cause as Record<string, unknown>;
    if (typeof record.message === 'string' && record.message) {
      return record.message;
    }
    if (
      Array.isArray(record.message) &&
      typeof record.message[0] === 'string'
    ) {
      return record.message[0];
    }
    if (Array.isArray(record.errors) && record.errors.length > 0) {
      const detail = (record.errors[0] as Record<string, unknown>)?.detail;
      if (typeof detail === 'string' && detail) {
        return detail;
      }
    }
  }

  return fallback;
}
