import { LoggerService } from '@libs/logger/logger.service';
import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@workers/config/config.service';
import { PlatformScheduleRegistryService } from '@workers/scheduling/platform-schedule-registry.service';
import {
  PLATFORM_SCHEDULE_CATALOG,
  PLATFORM_SCHEDULE_QUEUE,
  platformSchedulerId,
} from '@workers/scheduling/platform-schedules.constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('PlatformScheduleRegistryService', () => {
  const queue = {
    getJobSchedulers: vi.fn().mockResolvedValue([]),
    removeJobScheduler: vi.fn(),
    upsertJobScheduler: vi.fn(),
  };
  const configService = { isDevSchedulersEnabled: true };
  const logger = { log: vi.fn() };

  let service: PlatformScheduleRegistryService;

  beforeEach(() => {
    vi.clearAllMocks();
    queue.getJobSchedulers.mockResolvedValue([]);
    configService.isDevSchedulersEnabled = true;
    service = new PlatformScheduleRegistryService(
      queue as never,
      configService as ConfigService,
      logger as unknown as LoggerService,
    );
  });

  it('projects every catalog entry into one namespaced BullMQ scheduler', async () => {
    await service.reconcile();

    const entries = Object.entries(PLATFORM_SCHEDULE_CATALOG);
    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(entries.length);
    for (const [taskName, schedule] of entries) {
      expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
        platformSchedulerId(taskName as keyof typeof PLATFORM_SCHEDULE_CATALOG),
        { pattern: schedule.pattern, tz: 'UTC' },
        expect.objectContaining({ name: taskName }),
      );
    }
  });

  it('removes only retired scheduler ids owned by this control plane', async () => {
    queue.getJobSchedulers.mockResolvedValue([
      { key: 'posts-publish-sweep' },
      { key: 'platform:removed-task' },
      { key: 'external:scheduler' },
    ]);

    await service.reconcile();

    expect(queue.removeJobScheduler).toHaveBeenCalledTimes(2);
    expect(queue.removeJobScheduler).toHaveBeenCalledWith(
      'posts-publish-sweep',
    );
    expect(queue.removeJobScheduler).toHaveBeenCalledWith(
      'platform:removed-task',
    );
    expect(queue.removeJobScheduler).not.toHaveBeenCalledWith(
      'external:scheduler',
    );
  });

  it('does not touch Redis when local schedulers are disabled', async () => {
    configService.isDevSchedulersEnabled = false;

    await service.onApplicationBootstrap();

    expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
    expect(queue.getJobSchedulers).not.toHaveBeenCalled();
  });

  it('uses the established system-sweeps wire queue', () => {
    expect(getQueueToken(PLATFORM_SCHEDULE_QUEUE)).toBe(
      getQueueToken('system-sweeps'),
    );
  });
});
