import type { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PLATFORM_SCHEDULE_CATALOG,
  PLATFORM_SCHEDULED_TASKS,
} from '../../scheduling/platform-schedules.constants';
import { CronLifecycleEmailsService } from './cron.lifecycle-emails.service';

describe('CronLifecycleEmailsService', () => {
  const queueSystemWorkflow = vi.fn().mockResolvedValue(undefined);
  const service = new CronLifecycleEmailsService({
    queueSystemWorkflow,
  } as unknown as WorkflowExecutionQueueService);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-14T09:00:03.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs once an hour', () => {
    expect(
      PLATFORM_SCHEDULE_CATALOG[PLATFORM_SCHEDULED_TASKS.LIFECYCLE_EMAILS],
    ).toEqual({ pattern: '0 * * * *', timezone: 'UTC' });
  });

  it('queues the single system email sweep, deduplicated per hour', async () => {
    await service.processLifecycleEmails();

    expect(queueSystemWorkflow).toHaveBeenCalledOnce();
    expect(queueSystemWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: 'lifecycle-email.sweep',
        inputValues: {
          request: { referenceDate: '2026-10-14T09:00:03.000Z' },
        },
      }),
      `lifecycle-email.sweep-${Math.floor(Date.parse('2026-10-14T09:00:03.000Z') / 3_600_000)}`,
      expect.objectContaining({ attempts: 3 }),
    );
  });
});
