import { isMergeableRecord } from '@api/collections/brands/utils/brand-config-merge.util';
import {
  computeNextRunAtOrThrow,
  isSchedulableTimezone,
} from '@api/collections/workflows/utils/cron-schedule.util';
import { BadRequestException } from '@nestjs/common';

/**
 * Rejects a merged `agentConfig.schedule` whose timezone or cron expression the scheduler
 * cannot run. Only checked when the update touched the schedule.
 */
export function assertValidMergedAgentSchedule(
  updatedConfig: Record<string, unknown>,
  hasScheduleUpdate: boolean,
): void {
  if (!hasScheduleUpdate) {
    return;
  }

  const mergedSchedule = isMergeableRecord(updatedConfig.schedule)
    ? updatedConfig.schedule
    : null;
  const mergedCron =
    typeof mergedSchedule?.cronExpression === 'string'
      ? mergedSchedule.cronExpression.trim()
      : '';
  const mergedTimezone =
    typeof mergedSchedule?.timezone === 'string'
      ? mergedSchedule.timezone.trim()
      : '';

  if (mergedTimezone && !isSchedulableTimezone(mergedTimezone)) {
    throw new BadRequestException(
      `Invalid timezone "${mergedTimezone}". Use an IANA timezone name, for example "Europe/Berlin".`,
    );
  }

  if (mergedCron) {
    try {
      computeNextRunAtOrThrow(mergedCron, mergedTimezone || 'UTC');
    } catch {
      throw new BadRequestException(
        `Invalid cron expression "${mergedCron}". Use a valid cron schedule, for example "0 9 * * 1-5" for weekdays at 9:00 AM.`,
      );
    }
  }
}
