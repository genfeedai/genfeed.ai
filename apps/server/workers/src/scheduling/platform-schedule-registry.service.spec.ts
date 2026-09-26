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

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('PlatformScheduleRegistryService', () => {
  const queue = {
    getJobSchedulers: vi.fn().mockResolvedValue([]),
    removeJobScheduler: vi.fn(),
    upsertJobScheduler: vi.fn(),
  };
  const redisClient = { set: vi.fn().mockResolvedValue('OK') };
  const workflowExecutionQueue = {
    client: Promise.resolve(redisClient),
    getJobs: vi.fn().mockResolvedValue([]),
  };
  const workflowExecutions = {
    cancelExecution: vi.fn().mockResolvedValue({ status: 'CANCELLED' }),
  };
  const configService = { isDevSchedulersEnabled: true };
  const logger = { debug: vi.fn(), error: vi.fn(), log: vi.fn() };

  let service: PlatformScheduleRegistryService;

  beforeEach(() => {
    vi.clearAllMocks();
    queue.getJobSchedulers.mockResolvedValue([]);
    workflowExecutionQueue.getJobs.mockResolvedValue([]);
    workflowExecutionQueue.client = Promise.resolve(redisClient);
    redisClient.set.mockResolvedValue('OK');
    workflowExecutions.cancelExecution.mockResolvedValue({
      status: 'CANCELLED',
    });
    configService.isDevSchedulersEnabled = true;
    service = new PlatformScheduleRegistryService(
      queue as never,
      workflowExecutionQueue as never,
      workflowExecutions as never,
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
    await flushMicrotasks();

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

    function platformJob(id: string, source: string, executionId = id) {
      return job(id, {
        systemRun: {
          input: { source },
          priorExecution: { executionId },
        },
        type: 'system-run',
      });
    }

    it('cancels the execution before removing a waiting platform-sweep job (#5252 blocker)', async () => {
      const staleJob = platformJob(
        'system-workflow-old-sweep',
        'PlatformWorkflowSchedulesService',
        'execution-old-sweep',
      );
      workflowExecutionQueue.getJobs
        .mockResolvedValueOnce([staleJob])
        .mockResolvedValue([]);

      await service.drainStalePlatformSourcedJobs();

      expect(workflowExecutionQueue.getJobs).toHaveBeenCalledWith(
        ['waiting', 'delayed'],
        0,
        99,
      );
      expect(workflowExecutions.cancelExecution).toHaveBeenCalledWith(
        'execution-old-sweep',
      );
      const cancelOrder =
        workflowExecutions.cancelExecution.mock.invocationCallOrder[0];
      const removeOrder = staleJob.remove.mock.invocationCallOrder[0];
      expect(cancelOrder).toBeLessThan(removeOrder);
      expect(staleJob.remove).toHaveBeenCalledOnce();
    });

    it('cancels and removes a waiting proactive-turn job', async () => {
      const staleJob = platformJob(
        'system-workflow-old-proactive',
        'proactive',
      );
      workflowExecutionQueue.getJobs
        .mockResolvedValueOnce([staleJob])
        .mockResolvedValue([]);

      await service.drainStalePlatformSourcedJobs();

      expect(workflowExecutions.cancelExecution).toHaveBeenCalledWith(
        'system-workflow-old-proactive',
      );
      expect(staleJob.remove).toHaveBeenCalledOnce();
    });

    it('never touches an interactive agent turn', async () => {
      const interactiveJob = platformJob(
        'system-workflow-real-user-turn',
        'AgentTurnAcceptanceService.accept',
      );
      workflowExecutionQueue.getJobs
        .mockResolvedValueOnce([interactiveJob])
        .mockResolvedValue([]);

      await service.drainStalePlatformSourcedJobs();

      expect(workflowExecutions.cancelExecution).not.toHaveBeenCalled();
      expect(interactiveJob.remove).not.toHaveBeenCalled();
    });

    it('never touches a non-system-run job (trigger/delay-resume/scheduled-fire)', async () => {
      const triggerJob = job('trigger-job-1', { type: 'trigger' });
      workflowExecutionQueue.getJobs
        .mockResolvedValueOnce([triggerJob])
        .mockResolvedValue([]);

      await service.drainStalePlatformSourcedJobs();

      expect(workflowExecutions.cancelExecution).not.toHaveBeenCalled();
      expect(triggerJob.remove).not.toHaveBeenCalled();
    });

    it('leaves the job queued (does not remove it) when cancelExecution fails', async () => {
      const staleJob = platformJob(
        'system-workflow-cancel-fails',
        'PlatformWorkflowSchedulesService',
      );
      workflowExecutionQueue.getJobs
        .mockResolvedValueOnce([staleJob])
        .mockResolvedValue([]);
      workflowExecutions.cancelExecution.mockRejectedValue(
        new Error('db unavailable'),
      );

      await service.drainStalePlatformSourcedJobs();

      expect(staleJob.remove).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('failed to cancel the execution'),
        expect.objectContaining({ jobId: staleJob.id }),
      );
    });

    it('leaves the row alone when the job has no priorExecution.executionId to cancel', async () => {
      const staleJob = job('system-workflow-no-prior-execution', {
        systemRun: { input: { source: 'proactive' } },
        type: 'system-run',
      });
      workflowExecutionQueue.getJobs
        .mockResolvedValueOnce([staleJob])
        .mockResolvedValue([]);

      await service.drainStalePlatformSourcedJobs();

      expect(workflowExecutions.cancelExecution).not.toHaveBeenCalled();
      expect(staleJob.remove).not.toHaveBeenCalled();
    });

    it('logs at debug (not error) when a concurrent replica already removed the job', async () => {
      const staleJob = platformJob(
        'system-workflow-race',
        'PlatformWorkflowSchedulesService',
      );
      staleJob.remove.mockRejectedValue(new Error('job already removed'));
      workflowExecutionQueue.getJobs
        .mockResolvedValueOnce([staleJob])
        .mockResolvedValue([]);

      await expect(
        service.drainStalePlatformSourcedJobs(),
      ).resolves.toBeUndefined();
      expect(workflowExecutions.cancelExecution).toHaveBeenCalledOnce();
      expect(logger.debug).toHaveBeenCalledOnce();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('pages through the backlog instead of loading it all at once', async () => {
      const fullPage = Array.from({ length: 100 }, (_, index) =>
        platformJob(
          `system-workflow-page1-${index}`,
          'PlatformWorkflowSchedulesService',
        ),
      );
      const secondPage = [platformJob('system-workflow-page2-0', 'proactive')];
      workflowExecutionQueue.getJobs
        .mockResolvedValueOnce(fullPage)
        .mockResolvedValueOnce(secondPage)
        .mockResolvedValue([]);

      await service.drainStalePlatformSourcedJobs();

      expect(workflowExecutionQueue.getJobs).toHaveBeenNthCalledWith(
        1,
        ['waiting', 'delayed'],
        0,
        99,
      );
      expect(workflowExecutionQueue.getJobs).toHaveBeenNthCalledWith(
        2,
        ['waiting', 'delayed'],
        100,
        199,
      );
      expect(workflowExecutionQueue.getJobs).toHaveBeenCalledTimes(2);
      expect(secondPage[0].remove).toHaveBeenCalledOnce();
    });

    it('runs exactly once fleet-wide via an NX Redis marker, not once per boot', async () => {
      const staleJob = platformJob(
        'system-workflow-boot-drain',
        'PlatformWorkflowSchedulesService',
      );
      workflowExecutionQueue.getJobs
        .mockResolvedValueOnce([staleJob])
        .mockResolvedValue([]);

      await service.drainStalePlatformSourcedJobs();
      expect(staleJob.remove).toHaveBeenCalledOnce();

      // A second run (this replica reconnecting, or a second replica racing
      // the same key) must not re-scan — the marker is already claimed.
      redisClient.set.mockResolvedValue(null);
      workflowExecutionQueue.getJobs.mockClear();
      await service.drainStalePlatformSourcedJobs();
      expect(workflowExecutionQueue.getJobs).not.toHaveBeenCalled();
    });

    it('never fails worker boot when the drain itself throws', async () => {
      workflowExecutionQueue.client = Promise.reject(
        new Error('redis unreachable'),
      );
      workflowExecutionQueue.client.catch(() => {});

      await expect(
        service.drainStalePlatformSourcedJobs(),
      ).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('drain failed'),
        expect.objectContaining({ error: expect.any(Error) }),
      );
    });

    it('does not block bootstrap on the drain (fire-and-forget, off the critical path)', async () => {
      let resolveGetJobs: (jobs: unknown[]) => void = () => {};
      workflowExecutionQueue.getJobs.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveGetJobs = resolve;
          }),
      );

      const bootstrapped = service.onApplicationBootstrap();
      await expect(bootstrapped).resolves.toBeUndefined();

      // The drain is still pending — bootstrap did not wait for it.
      expect(workflowExecutionQueue.getJobs).toHaveBeenCalled();
      resolveGetJobs([]);
      await flushMicrotasks();
    });
  });
});
