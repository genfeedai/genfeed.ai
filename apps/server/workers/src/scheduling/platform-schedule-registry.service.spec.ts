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
  const workflowExecutionQueue = {
    getJobs: vi.fn().mockResolvedValue([]),
  };
  const configService = { isDevSchedulersEnabled: true };
  const logger = { error: vi.fn(), log: vi.fn() };

  let service: PlatformScheduleRegistryService;

  beforeEach(() => {
    vi.clearAllMocks();
    queue.getJobSchedulers.mockResolvedValue([]);
    workflowExecutionQueue.getJobs.mockResolvedValue([]);
    configService.isDevSchedulersEnabled = true;
    service = new PlatformScheduleRegistryService(
      queue as never,
      workflowExecutionQueue as never,
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
    expect(workflowExecutionQueue.getJobs).not.toHaveBeenCalled();
  });

  it('uses the established system-sweeps wire queue', () => {
    expect(getQueueToken(PLATFORM_SCHEDULE_QUEUE)).toBe(
      getQueueToken('system-sweeps'),
    );
  });

  describe('drainStalePlatformSourcedJobs (#5162 / #5252 review)', () => {
    function job(id: string, data: Record<string, unknown>) {
      return { data, id, remove: vi.fn().mockResolvedValue(undefined) };
    }

    it('removes a waiting platform-sweep job left on the old interactive queue', async () => {
      const staleJob = job('system-workflow-old-sweep', {
        systemRun: {
          input: { source: 'PlatformWorkflowSchedulesService' },
        },
        type: 'system-run',
      });
      workflowExecutionQueue.getJobs.mockResolvedValue([staleJob]);

      await service.drainStalePlatformSourcedJobs();

      expect(workflowExecutionQueue.getJobs).toHaveBeenCalledWith([
        'waiting',
        'delayed',
      ]);
      expect(staleJob.remove).toHaveBeenCalledOnce();
    });

    it('removes a waiting proactive-turn job left on the old interactive queue', async () => {
      const staleJob = job('system-workflow-old-proactive', {
        systemRun: { input: { source: 'proactive' } },
        type: 'system-run',
      });
      workflowExecutionQueue.getJobs.mockResolvedValue([staleJob]);

      await service.drainStalePlatformSourcedJobs();

      expect(staleJob.remove).toHaveBeenCalledOnce();
    });

    it('never removes an interactive agent turn', async () => {
      const interactiveJob = job('system-workflow-real-user-turn', {
        systemRun: {
          input: { source: 'AgentTurnAcceptanceService.accept' },
        },
        type: 'system-run',
      });
      workflowExecutionQueue.getJobs.mockResolvedValue([interactiveJob]);

      await service.drainStalePlatformSourcedJobs();

      expect(interactiveJob.remove).not.toHaveBeenCalled();
    });

    it('never removes a non-system-run job (trigger/delay-resume/scheduled-fire)', async () => {
      const triggerJob = job('trigger-job-1', { type: 'trigger' });
      workflowExecutionQueue.getJobs.mockResolvedValue([triggerJob]);

      await service.drainStalePlatformSourcedJobs();

      expect(triggerJob.remove).not.toHaveBeenCalled();
    });

    it('is idempotent under a concurrent replica already having removed the job', async () => {
      const staleJob = job('system-workflow-race', {
        systemRun: {
          input: { source: 'PlatformWorkflowSchedulesService' },
        },
        type: 'system-run',
      });
      staleJob.remove.mockRejectedValue(new Error('job already removed'));
      workflowExecutionQueue.getJobs.mockResolvedValue([staleJob]);

      await expect(
        service.drainStalePlatformSourcedJobs(),
      ).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledOnce();
    });

    it('runs automatically after reconcile on bootstrap when schedulers are enabled', async () => {
      const staleJob = job('system-workflow-boot-drain', {
        systemRun: {
          input: { source: 'PlatformWorkflowSchedulesService' },
        },
        type: 'system-run',
      });
      workflowExecutionQueue.getJobs.mockResolvedValue([staleJob]);

      await service.onApplicationBootstrap();

      expect(staleJob.remove).toHaveBeenCalledOnce();
    });
  });
});
