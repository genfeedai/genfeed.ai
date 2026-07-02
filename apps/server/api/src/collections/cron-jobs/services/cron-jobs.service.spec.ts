import {
  CronJobsService,
  computeNextRunAtOrThrow,
  LEGACY_CRON_JOBS_RETIRED_MESSAGE,
} from '@api/collections/cron-jobs/services/cron-jobs.service';
import type { CronJob as PrismaCronJob } from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';

describe('CronJobsService schedule validation', () => {
  it('should compute next run for valid cron expression', () => {
    const nextRun = computeNextRunAtOrThrow('0 9 * * 1', 'UTC');
    expect(nextRun).toBeInstanceOf(Date);
  });

  it('should throw for invalid cron expression', () => {
    expect(() => computeNextRunAtOrThrow('invalid-cron', 'UTC')).toThrow();
  });
});

describe('CronJobsService legacy cron workflow migration', () => {
  const now = new Date('2026-06-24T08:00:00.000Z');

  function buildCronJob(overrides: Partial<PrismaCronJob> = {}): PrismaCronJob {
    return {
      config: {
        consecutiveFailures: 0,
        enabled: true,
        jobType: 'newsletter_substack',
        lastStatus: 'never',
        name: 'Weekly newsletter',
        payload: { topic: 'Growth' },
        schedule: '0 9 * * 1',
        timezone: 'UTC',
      },
      createdAt: now,
      expression: '0 9 * * 1',
      id: 'cron-1',
      isDeleted: false,
      label: 'Weekly newsletter',
      lastRunAt: now,
      mongoId: null,
      nextRunAt: now,
      organizationId: 'org-1',
      status: 'ACTIVE',
      updatedAt: now,
      userId: 'user-1',
      ...overrides,
    } as PrismaCronJob;
  }

  function createService() {
    const prisma = {
      $transaction: vi.fn(async (callback: (client: unknown) => unknown) =>
        callback(prisma),
      ),
      agentStrategy: {
        findFirst: vi.fn(),
      },
      cronJob: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      cronRun: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      workflow: {
        create: vi.fn(),
        findFirst: vi.fn(),
      },
    };
    const workflowsService = {
      findOne: vi.fn(),
    };
    const legacyWorkflowStepRunner = {
      executeWorkflow: vi.fn(),
    };
    const cacheService = {
      acquireLock: vi.fn(),
      releaseLock: vi.fn(),
    };
    const creditsUtilsService = {
      checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
    };
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const service = new CronJobsService(
      prisma as never,
      workflowsService as never,
      legacyWorkflowStepRunner as never,
      { create: vi.fn() } as never,
      { queueRun: vi.fn() } as never,
      { chatCompletion: vi.fn() } as never,
      { createDraft: vi.fn(), deliverDraftWebhook: vi.fn() } as never,
      cacheService as never,
      creditsUtilsService as never,
      logger as never,
    );

    return {
      cacheService,
      creditsUtilsService,
      legacyWorkflowStepRunner,
      logger,
      prisma,
      service,
      workflowsService,
    };
  }

  it('reports invalid supported rows without creating workflows', async () => {
    const { prisma, service } = createService();
    prisma.cronJob.findMany.mockResolvedValue([
      buildCronJob({
        config: {
          enabled: true,
          jobType: 'workflow_execution',
          payload: {},
          schedule: '0 9 * * *',
          timezone: 'UTC',
        },
      }),
    ]);
    prisma.workflow.findFirst.mockResolvedValue(null);

    const report = await service.migrateLegacyJobsToWorkflows();

    expect(report.invalid).toBe(1);
    expect(report.details[0]).toMatchObject({
      cronJobId: 'cron-1',
      jobType: 'workflow_execution',
      status: 'invalid',
    });
    expect(report.details[0]?.errors).toContain(
      'payload.workflowId is required for workflow_execution',
    );
    expect(prisma.workflow.create).not.toHaveBeenCalled();
    expect(prisma.cronJob.update).not.toHaveBeenCalled();
  });

  it('creates a scheduled workflow and marks the legacy row migrated', async () => {
    const { prisma, service } = createService();
    prisma.cronJob.findMany.mockResolvedValue([
      buildCronJob({
        config: {
          enabled: true,
          jobType: 'newsletter_substack',
          lastStatus: 'success',
          name: 'Weekly newsletter',
          payload: {
            topic: 'Growth',
            webhookSecret: 'super-secret',
          },
          schedule: '0 9 * * 1',
          timezone: 'Europe/Malta',
        },
        expression: '0 9 * * 1',
      }),
    ]);
    prisma.workflow.findFirst.mockResolvedValue(null);
    prisma.cronRun.count.mockResolvedValue(7);
    prisma.workflow.create.mockResolvedValue({ id: 'workflow-migrated' });

    const report = await service.migrateLegacyJobsToWorkflows({
      dryRun: false,
    });

    expect(report.migrated).toBe(1);
    expect(prisma.workflow.create).toHaveBeenCalledTimes(1);
    const createArg = prisma.workflow.create.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(createArg.data).toMatchObject({
      executionCount: 7,
      isScheduleEnabled: true,
      label: 'Migrated: Weekly newsletter',
      organizationId: 'org-1',
      schedule: '0 9 * * 1',
      status: 'active',
      timezone: 'Europe/Malta',
      userId: 'user-1',
    });
    expect(JSON.stringify(createArg.data.nodes)).not.toContain('super-secret');
    expect(createArg.data.nodes).toMatchObject([
      {
        data: {
          config: {
            jobType: 'newsletter_substack',
            legacyCronJobId: 'cron-1',
          },
        },
        type: 'legacyCronJob',
      },
    ]);
    expect(prisma.cronJob.update).toHaveBeenCalledWith({
      data: {
        config: expect.objectContaining({
          enabled: false,
          migration: expect.objectContaining({
            originalEnabled: true,
            status: 'workflow_migrated',
            workflowId: 'workflow-migrated',
          }),
        }),
        status: 'PAUSED',
      },
      where: { id: 'cron-1' },
    });
  });

  it('reuses an existing migrated workflow on rerun', async () => {
    const { prisma, service } = createService();
    prisma.cronJob.findMany.mockResolvedValue([buildCronJob()]);
    prisma.workflow.findFirst.mockResolvedValue({ id: 'workflow-existing' });

    const report = await service.migrateLegacyJobsToWorkflows({
      dryRun: false,
    });

    expect(report.migrated).toBe(1);
    expect(report.details[0]).toMatchObject({
      status: 'migrated',
      workflowId: 'workflow-existing',
    });
    expect(prisma.workflow.create).not.toHaveBeenCalled();
    expect(prisma.cronJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PAUSED',
        }),
      }),
    );
  });

  it('skips migrated rows in the legacy runner even if they are returned', async () => {
    const { cacheService, prisma, service } = createService();
    prisma.cronJob.findMany.mockResolvedValue([
      buildCronJob({
        config: {
          enabled: true,
          jobType: 'newsletter_substack',
          migration: {
            status: 'workflow_migrated',
            workflowId: 'workflow-migrated',
          },
          payload: { topic: 'Growth' },
          schedule: '0 9 * * 1',
          timezone: 'UTC',
        },
      }),
    ]);

    const processed = await service.processDueJobs();

    expect(processed).toBe(0);
    expect(cacheService.acquireLock).not.toHaveBeenCalled();
  });

  it.each([
    [
      'create',
      (service: CronJobsService) =>
        service.create('user-1', 'org-1', {
          jobType: 'workflow_execution',
          name: 'Legacy schedule',
          schedule: '0 9 * * *',
        }),
    ],
    [
      'update',
      (service: CronJobsService) =>
        service.update('cron-1', 'org-1', { name: 'Updated' }),
    ],
    ['pause', (service: CronJobsService) => service.pause('cron-1', 'org-1')],
    ['resume', (service: CronJobsService) => service.resume('cron-1', 'org-1')],
    ['delete', (service: CronJobsService) => service.delete('cron-1', 'org-1')],
    ['runNow', (service: CronJobsService) => service.runNow('cron-1', 'org-1')],
  ])('rejects retired legacy cron mutation %s', async (_name, action) => {
    const { prisma, service } = createService();

    await expect(action(service)).rejects.toThrow(
      LEGACY_CRON_JOBS_RETIRED_MESSAGE,
    );

    expect(prisma.cronJob.create).not.toHaveBeenCalled();
    expect(prisma.cronJob.update).not.toHaveBeenCalled();
    expect(prisma.cronJob.findFirst).not.toHaveBeenCalled();
  });

  it('executes migrated workflow_execution rows through the legacy step runner', async () => {
    const { legacyWorkflowStepRunner, prisma, service, workflowsService } =
      createService();
    prisma.cronJob.findFirst.mockResolvedValue(
      buildCronJob({
        config: {
          enabled: false,
          jobType: 'workflow_execution',
          migration: {
            status: 'workflow_migrated',
            workflowId: 'workflow-migrated',
          },
          payload: { workflowId: 'workflow-target' },
          schedule: '0 9 * * *',
          timezone: 'UTC',
        },
        status: 'PAUSED',
      }),
    );
    workflowsService.findOne.mockResolvedValue({ id: 'workflow-target' });

    const result = await service.executeMigratedLegacyCronJob({
      legacyCronJobId: 'cron-1',
      organizationId: 'org-1',
      userId: 'user-1',
    });

    expect(result).toEqual({ workflowId: 'workflow-target' });
    expect(legacyWorkflowStepRunner.executeWorkflow).toHaveBeenCalledWith(
      'workflow-target',
    );
  });
});
