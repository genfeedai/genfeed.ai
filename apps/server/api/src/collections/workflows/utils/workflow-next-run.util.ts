import { computeNextRunAtOrThrow } from '@api/collections/workflows/utils/cron-schedule.util';

interface SchedulableWorkflowFields {
  isScheduleEnabled?: boolean | null;
  schedule?: string | null;
  timezone?: string | null;
}

/**
 * Attach the derived next-fire instant to a workflow read model.
 *
 * `nextRunAt` is never persisted — it is computed from the stored cron +
 * timezone at read time so the displayed value can never drift from what the
 * scheduler will actually do. Disabled, unscheduled, or unparsable rows carry
 * an explicit `null` so clients can distinguish "no upcoming run" from a
 * missing attribute.
 */
export function withNextRunAt<T extends SchedulableWorkflowFields>(
  workflow: T,
): T & { nextRunAt: string | null } {
  if (!workflow.schedule || !workflow.isScheduleEnabled) {
    return { ...workflow, nextRunAt: null };
  }

  try {
    return {
      ...workflow,
      nextRunAt: computeNextRunAtOrThrow(
        workflow.schedule,
        workflow.timezone ?? 'UTC',
      ).toISOString(),
    };
  } catch {
    return { ...workflow, nextRunAt: null };
  }
}
