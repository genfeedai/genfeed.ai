import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import type { WorkflowDocument } from '@api/collections/workflows/schemas/workflow.schema';
import { EXECUTABLE_WORKFLOW_SELECT } from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowSchedulerService } from '@api/collections/workflows/services/workflow-scheduler.service';
import { ANALYTICS_SYNC_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/analytics-sync-workflows.template';
import { getPlatformSeedContentHash } from '@api/collections/workflows/utils/workflow-platform-seed.util';
import { getOrganizationModuleExecutionContext } from '@api/common/organization-modules/organization-module-execution.context';
import {
  MemberRole,
  WorkflowExecutionTrigger,
  WorkflowStatus,
} from '@genfeedai/contracts';
import { Prisma } from '@genfeedai/prisma';
import { ForbiddenException, HttpException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ cloud: false }));
vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  isCloudDeployment: () => runtime.cloud,
}));

function createMockLogger() {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
}

function createMockPrisma() {
  return {
    apiKey: { findFirst: vi.fn().mockResolvedValue(null) },
    brand: { findFirst: vi.fn().mockResolvedValue({ id: 'brand-1' }) },
    member: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ brands: [], role: { key: MemberRole.ADMIN } }),
    },
    workflow: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

function createMockQueueService() {
  return {
    removeWorkflowScheduler: vi.fn().mockResolvedValue(undefined),
    upsertWorkflowScheduler: vi.fn().mockResolvedValue(undefined),
  };
}

function versionedWorkflow(input: {
  contentHash?: string;
  id: string;
  inputVariables?: unknown[];
  nodes?: unknown[];
  organizationId?: string | null;
  userId?: string | null;
  [key: string]: unknown;
}) {
  const { contentHash, inputVariables = [], nodes = [], ...identity } = input;

  return {
    ...identity,
    currentVersion: {
      ...(contentHash ? { contentHash } : {}),
      graph: { edges: [], lockedNodeIds: [], nodes },
      id: `${input.id}-version-1`,
      inputSchema: inputVariables,
      version: 1,
    },
  };
}

function createService(
  overrides: {
    prisma?: ReturnType<typeof createMockPrisma>;
    queueService?: ReturnType<typeof createMockQueueService>;
    workflowExecutorService?: {
      executeManualWorkflow: ReturnType<typeof vi.fn>;
      executeManualWorkflowDocument: ReturnType<typeof vi.fn>;
    };
    isDevSchedulersEnabled?: boolean;
  } = {},
) {
  const prisma = overrides.prisma ?? createMockPrisma();
  const logger = createMockLogger();
  const configService = {
    isDevSchedulersEnabled: overrides.isDevSchedulersEnabled ?? false,
  };
  const workflowExecutorService = overrides.workflowExecutorService ?? {
    executeManualWorkflow: vi.fn().mockResolvedValue({}),
    executeManualWorkflowDocument: vi.fn().mockResolvedValue({}),
  };
  const queueService = overrides.queueService ?? createMockQueueService();
  const moduleAccess = { assertAccess: vi.fn().mockResolvedValue(undefined) };
  const brandAccess = new BrandAccessService(prisma as never);

  const service = new (
    WorkflowSchedulerService as unknown as new (
      ...args: unknown[]
    ) => WorkflowSchedulerService
  )(
    prisma,
    logger,
    configService,
    workflowExecutorService,
    queueService,
    moduleAccess,
    brandAccess,
  );

  return {
    brandAccess,
    moduleAccess,
    logger,
    prisma,
    queueService,
    service,
    workflowExecutorService,
  };
}

beforeEach(() => {
  runtime.cloud = false;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('WorkflowSchedulerService — job scheduler registration', () => {
  it('registers every enabled system workflow through the shared scheduler', async () => {
    const { queueService, service } = createService({});

    await service.scheduleWorkflow({
      id: 'wf-system',
      isScheduleEnabled: true,
      schedule: '*/15 * * * *',
      timezone: 'UTC',
    } as unknown as WorkflowDocument);

    expect(queueService.upsertWorkflowScheduler).toHaveBeenCalledWith({
      cronExpression: '*/15 * * * *',
      timezone: 'UTC',
      workflowId: 'wf-system',
    });
    expect(queueService.removeWorkflowScheduler).not.toHaveBeenCalled();
  });

  it('registers job schedulers for catalog system workflows with executable graphs', async () => {
    const { queueService, service } = createService({});

    await service.scheduleWorkflow({
      id: 'wf-loop',
      isScheduleEnabled: true,
      schedule: '0 8 * * *',
      timezone: 'UTC',
    } as unknown as WorkflowDocument);

    expect(queueService.upsertWorkflowScheduler).toHaveBeenCalledWith({
      cronExpression: '0 8 * * *',
      timezone: 'UTC',
      workflowId: 'wf-loop',
    });
    expect(queueService.removeWorkflowScheduler).not.toHaveBeenCalled();
  });

  it('upserts a BullMQ job scheduler when a schedule is set and enabled', async () => {
    const prisma = createMockPrisma();
    prisma.workflow.findFirst.mockResolvedValue({ id: 'wf-1' });
    prisma.workflow.update.mockResolvedValue(
      versionedWorkflow({
        id: 'wf-1',
        isScheduleEnabled: true,
        schedule: '0 7 * * *',
        timezone: 'Europe/Amsterdam',
      }),
    );
    const { queueService, service } = createService({ prisma });

    const updated = await service.updateSchedule(
      'wf-1',
      'org-1',
      '0 7 * * *',
      'Europe/Amsterdam',
      true,
    );

    expect(updated).not.toBeNull();
    expect(queueService.upsertWorkflowScheduler).toHaveBeenCalledWith({
      cronExpression: '0 7 * * *',
      timezone: 'Europe/Amsterdam',
      workflowId: 'wf-1',
    });
    expect(queueService.removeWorkflowScheduler).not.toHaveBeenCalled();
  });

  it('removes the job scheduler when the schedule is disabled', async () => {
    const prisma = createMockPrisma();
    prisma.workflow.findFirst.mockResolvedValue({ id: 'wf-1' });
    prisma.workflow.update.mockResolvedValue(
      versionedWorkflow({
        id: 'wf-1',
        isScheduleEnabled: false,
        schedule: '0 7 * * *',
      }),
    );
    const { queueService, service } = createService({ prisma });

    await service.updateSchedule('wf-1', 'org-1', '0 7 * * *', 'UTC', false);

    expect(queueService.removeWorkflowScheduler).toHaveBeenCalledWith('wf-1');
    expect(queueService.upsertWorkflowScheduler).not.toHaveBeenCalled();
  });

  it('removes the job scheduler when the schedule is cleared', async () => {
    const prisma = createMockPrisma();
    prisma.workflow.findFirst.mockResolvedValue({ id: 'wf-1' });
    prisma.workflow.update.mockResolvedValue(
      versionedWorkflow({
        id: 'wf-1',
        isScheduleEnabled: false,
        schedule: null,
      }),
    );
    const { queueService, service } = createService({ prisma });

    await service.updateSchedule('wf-1', 'org-1', null, 'UTC', true);

    expect(queueService.removeWorkflowScheduler).toHaveBeenCalledWith('wf-1');
  });

  it('returns null without touching schedulers for a missing workflow', async () => {
    const { prisma, queueService, service } = createService();
    prisma.workflow.findFirst.mockResolvedValue(null);

    const updated = await service.updateSchedule(
      'wf-gone',
      'org-1',
      '0 7 * * *',
    );

    expect(updated).toBeNull();
    expect(queueService.upsertWorkflowScheduler).not.toHaveBeenCalled();
    expect(queueService.removeWorkflowScheduler).not.toHaveBeenCalled();
  });

  it('rejects an invalid cron expression before persistence', async () => {
    const prisma = createMockPrisma();
    prisma.workflow.findFirst.mockResolvedValue({ id: 'wf-1' });
    const { queueService, service } = createService({ prisma });

    await expect(
      service.updateSchedule('wf-1', 'org-1', 'not a cron', 'UTC', true),
    ).rejects.toMatchObject({
      message: expect.stringContaining('not a cron'),
      status: 400,
    });
    expect(prisma.workflow.update).not.toHaveBeenCalled();
    expect(queueService.upsertWorkflowScheduler).not.toHaveBeenCalled();
  });

  it('rejects an unknown IANA timezone before persistence', async () => {
    const prisma = createMockPrisma();
    prisma.workflow.findFirst.mockResolvedValue({ id: 'wf-1' });
    const { queueService, service } = createService({ prisma });

    await expect(
      service.updateSchedule(
        'wf-1',
        'org-1',
        '0 7 * * *',
        'Mars/Olympus',
        true,
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('Mars/Olympus'),
      status: 400,
    });
    expect(prisma.workflow.update).not.toHaveBeenCalled();
    expect(queueService.upsertWorkflowScheduler).not.toHaveBeenCalled();
  });

  it('allows schedule pause on catalog system workflows', async () => {
    const prisma = createMockPrisma();
    prisma.workflow.findFirst.mockResolvedValue({ id: 'wf-loop' });
    prisma.workflow.update.mockResolvedValue(
      versionedWorkflow({
        id: 'wf-loop',
        isScheduleEnabled: false,
        schedule: '0 8 * * *',
        timezone: 'UTC',
      }),
    );
    const { queueService, service } = createService({ prisma });

    const updated = await service.updateSchedule(
      'wf-loop',
      'org-1',
      '0 8 * * *',
      'UTC',
      false,
    );

    expect(updated).not.toBeNull();
    expect(prisma.workflow.update).toHaveBeenCalled();
    expect(queueService.removeWorkflowScheduler).toHaveBeenCalledWith(
      'wf-loop',
    );
    expect(queueService.upsertWorkflowScheduler).not.toHaveBeenCalled();
  });

  it('surfaces scheduler registration failures to the caller instead of logging silently', async () => {
    const prisma = createMockPrisma();
    prisma.workflow.findFirst.mockResolvedValue({ id: 'wf-1' });
    prisma.workflow.update.mockResolvedValue(
      versionedWorkflow({
        id: 'wf-1',
        isScheduleEnabled: true,
        schedule: '0 7 * * *',
        timezone: 'UTC',
      }),
    );
    const queueService = createMockQueueService();
    queueService.upsertWorkflowScheduler.mockRejectedValue(
      new Error('redis unavailable'),
    );
    const { service } = createService({ prisma, queueService });

    await expect(
      service.updateSchedule('wf-1', 'org-1', '0 7 * * *', 'UTC', true),
    ).rejects.toThrow('redis unavailable');
  });
});

describe('WorkflowSchedulerService — boot sync', () => {
  it('skips the boot sync when schedulers are disabled', async () => {
    const { prisma, service } = createService({
      isDevSchedulersEnabled: false,
    });

    await service.onModuleInit();

    expect(prisma.workflow.findMany).not.toHaveBeenCalled();
  });

  it('upserts a scheduler for every enabled scheduled workflow on boot', async () => {
    const prisma = createMockPrisma();
    prisma.workflow.findMany.mockResolvedValue([
      {
        id: 'wf-1',
        isScheduleEnabled: true,
        schedule: '0 7 * * *',
        timezone: 'UTC',
      },
      {
        id: 'wf-2',
        isScheduleEnabled: true,
        schedule: '*/10 * * * *',
        timezone: 'Europe/Amsterdam',
      },
    ]);
    const { queueService, service } = createService({
      isDevSchedulersEnabled: true,
      prisma,
    });

    await service.onModuleInit();

    expect(prisma.workflow.findMany).toHaveBeenCalledWith({
      select: {
        id: true,
        isScheduleEnabled: true,
        schedule: true,
        timezone: true,
      },
      where: {
        isDeleted: false,
        isScheduleEnabled: true,
        schedule: { not: null },
        status: WorkflowStatus.ACTIVE,
      },
    });
    expect(queueService.upsertWorkflowScheduler).toHaveBeenCalledTimes(2);
    expect(queueService.upsertWorkflowScheduler).toHaveBeenCalledWith({
      cronExpression: '0 7 * * *',
      timezone: 'UTC',
      workflowId: 'wf-1',
    });
    expect(queueService.upsertWorkflowScheduler).toHaveBeenCalledWith({
      cronExpression: '*/10 * * * *',
      timezone: 'Europe/Amsterdam',
      workflowId: 'wf-2',
    });
  });
});

describe('WorkflowSchedulerService — scheduled fire execution', () => {
  it('executes a node-based workflow via the workflow engine executor', async () => {
    const prisma = createMockPrisma();
    prisma.workflow.findFirst.mockResolvedValue(
      versionedWorkflow({
        id: 'wf-1',
        inputVariables: [],
        nodes: [{ id: 'node-1' }],
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    );
    const workflowExecutorService = {
      executeManualWorkflow: vi.fn().mockResolvedValue({}),
      executeManualWorkflowDocument: vi.fn().mockResolvedValue({}),
    };
    const { service } = createService({ prisma, workflowExecutorService });

    await service.executeScheduledWorkflow('wf-1', 'fire-1');

    expect(prisma.workflow.findFirst).toHaveBeenCalledWith({
      select: {
        ...EXECUTABLE_WORKFLOW_SELECT,
        currentVersion: {
          select: {
            ...EXECUTABLE_WORKFLOW_SELECT.currentVersion.select,
            contentHash: true,
          },
        },
        platformSeedKey: true,
        scheduleInitiatingActor: true,
        templateInstantiationKey: true,
      },
      where: {
        id: 'wf-1',
        isDeleted: false,
        isScheduleEnabled: true,
        status: WorkflowStatus.ACTIVE,
      },
    });
    expect(prisma.workflow.update).toHaveBeenCalledTimes(1);
    expect(
      workflowExecutorService.executeManualWorkflowDocument,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'wf-1' }),
      'user-1',
      'org-1',
      {},
      {
        scheduledFireJobId: 'fire-1',
        triggeredBy: 'schedule',
      },
      WorkflowExecutionTrigger.SCHEDULED,
    );
  });

  it('disables and unschedules workflows when required input defaults are missing', async () => {
    const prisma = createMockPrisma();
    prisma.workflow.findFirst.mockResolvedValue(
      versionedWorkflow({
        id: 'wf-1',
        inputVariables: [
          {
            key: 'titleText',
            label: 'Title text',
            required: true,
            type: 'text',
          },
        ],
        nodes: [{ id: 'node-1' }],
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    );
    const workflowExecutorService = {
      executeManualWorkflow: vi.fn().mockResolvedValue({}),
      executeManualWorkflowDocument: vi.fn().mockResolvedValue({}),
    };
    const { logger, queueService, service } = createService({
      prisma,
      workflowExecutorService,
    });

    await service.executeScheduledWorkflow('wf-1');

    expect(prisma.workflow.update).toHaveBeenCalledWith({
      data: {
        isScheduleEnabled: false,
        scheduleInitiatingActor: Prisma.DbNull,
      },
      where: {
        id: 'wf-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(queueService.removeWorkflowScheduler).toHaveBeenCalledWith('wf-1');
    expect(
      workflowExecutorService.executeManualWorkflowDocument,
    ).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('titleText'),
      'WorkflowSchedulerService',
    );
  });

  it('removes the job scheduler when the workflow is missing or inactive', async () => {
    const prisma = createMockPrisma();
    prisma.workflow.findFirst.mockResolvedValue(null);
    const workflowExecutorService = {
      executeManualWorkflow: vi.fn().mockResolvedValue({}),
      executeManualWorkflowDocument: vi.fn().mockResolvedValue({}),
    };
    const { logger, queueService, service } = createService({
      prisma,
      workflowExecutorService,
    });

    await service.executeScheduledWorkflow('wf-gone');

    expect(queueService.removeWorkflowScheduler).toHaveBeenCalledWith(
      'wf-gone',
    );
    expect(
      workflowExecutorService.executeManualWorkflowDocument,
    ).not.toHaveBeenCalled();
    expect(prisma.workflow.update).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('fires a node-based morning digest three times on schedule (#2664)', async () => {
    const prisma = createMockPrisma();
    prisma.workflow.findFirst.mockResolvedValue(
      versionedWorkflow({
        id: 'wf-morning-digest',
        inputVariables: [],
        nodes: [
          { id: 'read', type: 'socialRead' },
          { id: 'analyze', type: 'analyze' },
          { id: 'report', type: 'reportDelivery' },
        ],
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    );
    const workflowExecutorService = {
      executeManualWorkflow: vi.fn().mockResolvedValue({}),
      executeManualWorkflowDocument: vi.fn().mockResolvedValue({}),
    };
    const { service } = createService({ prisma, workflowExecutorService });

    await service.executeScheduledWorkflow('wf-morning-digest');
    await service.executeScheduledWorkflow('wf-morning-digest');
    await service.executeScheduledWorkflow('wf-morning-digest');

    expect(
      workflowExecutorService.executeManualWorkflowDocument,
    ).toHaveBeenCalledTimes(3);
    expect(
      workflowExecutorService.executeManualWorkflowDocument,
    ).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: 'wf-morning-digest' }),
      'user-1',
      'org-1',
      {},
      { triggeredBy: 'schedule' },
      WorkflowExecutionTrigger.SCHEDULED,
    );
    expect(
      workflowExecutorService.executeManualWorkflowDocument.mock.calls.every(
        (call) => call[5] === WorkflowExecutionTrigger.SCHEDULED,
      ),
    ).toBe(true);
  });

  it('removes the job scheduler for systemic templates without user/org', async () => {
    const prisma = createMockPrisma();
    prisma.workflow.findFirst.mockResolvedValue(
      versionedWorkflow({
        id: 'wf-template',
        inputVariables: [],
        nodes: [{ id: 'node-1' }],
        organizationId: null,
        userId: null,
      }),
    );
    const workflowExecutorService = {
      executeManualWorkflow: vi.fn().mockResolvedValue({}),
      executeManualWorkflowDocument: vi.fn().mockResolvedValue({}),
    };
    const { queueService, service } = createService({
      prisma,
      workflowExecutorService,
    });

    await service.executeScheduledWorkflow('wf-template');

    expect(queueService.removeWorkflowScheduler).toHaveBeenCalledWith(
      'wf-template',
    );
    expect(
      workflowExecutorService.executeManualWorkflowDocument,
    ).not.toHaveBeenCalled();
  });
});

describe('scheduled Automation admission', () => {
  function scheduledFixture() {
    const fixture = createService();
    fixture.prisma.workflow.findFirst.mockResolvedValue(
      versionedWorkflow({
        id: 'wf-1',
        organizationId: 'org-1',
        userId: 'user-1',
        metadata: {
          organizationModuleContext: {
            moduleId: 'playground',
            organizationId: 'org-1',
          },
        },
      }),
    );
    return fixture;
  }

  it.each(['disabled', 'subscription-required'])(
    'skips %s scheduled work before writes while preserving the schedule for later re-enabling',
    async (reason) => {
      const {
        moduleAccess,
        service,
        prisma,
        workflowExecutorService,
        queueService,
        logger,
      } = scheduledFixture();
      moduleAccess.assertAccess.mockRejectedValueOnce(
        new HttpException({ reason }, 403),
      );
      await service.executeScheduledWorkflow('wf-1', 'job-1');
      expect(moduleAccess.assertAccess).toHaveBeenCalledWith(
        'org-1',
        'automation',
      );
      expect(prisma.workflow.update).not.toHaveBeenCalled();
      expect(
        workflowExecutorService.executeManualWorkflowDocument,
      ).not.toHaveBeenCalled();
      expect(queueService.removeWorkflowScheduler).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalled();
    },
  );

  it('rechecks after a warm successful fire instead of borrowing authored metadata', async () => {
    const { moduleAccess, service, prisma, workflowExecutorService } =
      scheduledFixture();
    let observedScope: ReturnType<typeof getOrganizationModuleExecutionContext>;
    workflowExecutorService.executeManualWorkflowDocument.mockImplementationOnce(
      async () => {
        await Promise.resolve();
        observedScope = getOrganizationModuleExecutionContext();
        return {};
      },
    );
    await service.executeScheduledWorkflow('wf-1', 'job-1');
    await Promise.resolve();
    expect(observedScope).toEqual({
      organizationId: 'org-1',
      moduleId: 'automation',
    });
    expect(getOrganizationModuleExecutionContext()).toBeUndefined();
    moduleAccess.assertAccess.mockRejectedValueOnce(
      new HttpException('Subscription expired', 403),
    );
    await service.executeScheduledWorkflow('wf-1', 'job-2');
    expect(moduleAccess.assertAccess).toHaveBeenCalledTimes(2);
    expect(prisma.workflow.update).toHaveBeenCalledTimes(1);
    expect(
      workflowExecutorService.executeManualWorkflowDocument,
    ).toHaveBeenCalledTimes(1);
  });

  it('logs unavailable admission without creating an execution or disabling the saved schedule', async () => {
    const {
      moduleAccess,
      service,
      prisma,
      workflowExecutorService,
      queueService,
      logger,
    } = scheduledFixture();
    moduleAccess.assertAccess.mockRejectedValueOnce(
      new HttpException('Module access unavailable', 503),
    );
    await service.executeScheduledWorkflow('wf-1', 'job-1');
    expect(prisma.workflow.update).not.toHaveBeenCalled();
    expect(
      workflowExecutorService.executeManualWorkflowDocument,
    ).not.toHaveBeenCalled();
    expect(queueService.removeWorkflowScheduler).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to execute'),
      expect.any(HttpException),
      'WorkflowSchedulerService',
    );
  });
});

describe('WorkflowSchedulerService — schedule initiating actor capture', () => {
  const principal = {
    apiKeyId: 'key-1',
    isApiKey: true,
    organizationId: 'org-1',
    scopes: ['workflows:write', 'brands:read', 'brands:read'],
    userId: 'user-1',
  };

  function savedWorkflow() {
    return versionedWorkflow({
      id: 'wf-1',
      isScheduleEnabled: true,
      schedule: '0 7 * * *',
      timezone: 'UTC',
    });
  }

  function writtenData(prisma: ReturnType<typeof createMockPrisma>) {
    const [args] = prisma.workflow.update.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    return args.data;
  }

  it('binds an enabled schedule to the authenticated principal, normalised', async () => {
    const prisma = createMockPrisma();
    prisma.workflow.findFirst.mockResolvedValue({ id: 'wf-1' });
    prisma.workflow.update.mockResolvedValue(savedWorkflow());
    const { service } = createService({ prisma });

    await service.updateSchedule(
      'wf-1',
      'org-1',
      '0 7 * * *',
      'UTC',
      true,
      principal,
    );

    expect(writtenData(prisma).scheduleInitiatingActor).toEqual({
      apiKeyId: 'key-1',
      isApiKey: true,
      organizationId: 'org-1',
      scopes: ['brands:read', 'workflows:write'],
      userId: 'user-1',
    });
  });

  it('rewrites the binding to the new configuring principal on every enabled save', async () => {
    const prisma = createMockPrisma();
    prisma.workflow.findFirst.mockResolvedValue({ id: 'wf-1' });
    prisma.workflow.update.mockResolvedValue(savedWorkflow());
    const { service } = createService({ prisma });

    await service.updateSchedule('wf-1', 'org-1', '0 7 * * *', 'UTC', true, {
      organizationId: 'org-1',
      userId: 'user-2',
    });

    expect(writtenData(prisma).scheduleInitiatingActor).toEqual({
      isApiKey: false,
      organizationId: 'org-1',
      scopes: [],
      userId: 'user-2',
    });
  });

  it('clears the binding when the schedule is paused', async () => {
    const prisma = createMockPrisma();
    prisma.workflow.findFirst.mockResolvedValue({ id: 'wf-1' });
    prisma.workflow.update.mockResolvedValue(savedWorkflow());
    const { service } = createService({ prisma });

    await service.updateSchedule(
      'wf-1',
      'org-1',
      '0 7 * * *',
      'UTC',
      false,
      principal,
    );

    expect(writtenData(prisma).scheduleInitiatingActor).toBe(Prisma.DbNull);
  });

  it('clears the binding when the schedule is removed', async () => {
    const prisma = createMockPrisma();
    prisma.workflow.findFirst.mockResolvedValue({ id: 'wf-1' });
    prisma.workflow.update.mockResolvedValue(savedWorkflow());
    const { service } = createService({ prisma });

    await service.updateSchedule('wf-1', 'org-1', null, 'UTC', true, principal);

    expect(writtenData(prisma).scheduleInitiatingActor).toBe(Prisma.DbNull);
  });

  it('leaves an enabled schedule unbound when the caller supplies no principal', async () => {
    const prisma = createMockPrisma();
    prisma.workflow.findFirst.mockResolvedValue({ id: 'wf-1' });
    prisma.workflow.update.mockResolvedValue(savedWorkflow());
    const { service } = createService({ prisma });

    await service.updateSchedule('wf-1', 'org-1', '0 7 * * *', 'UTC', true);

    expect(writtenData(prisma).scheduleInitiatingActor).toBe(Prisma.DbNull);
  });

  it('rejects a principal from another organization before persisting', async () => {
    const prisma = createMockPrisma();
    prisma.workflow.findFirst.mockResolvedValue({ id: 'wf-1' });
    const { queueService, service } = createService({ prisma });

    await expect(
      service.updateSchedule('wf-1', 'org-1', '0 7 * * *', 'UTC', true, {
        ...principal,
        organizationId: 'org-2',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.workflow.update).not.toHaveBeenCalled();
    expect(queueService.upsertWorkflowScheduler).not.toHaveBeenCalled();
  });
});

describe('WorkflowSchedulerService — scheduled run actor', () => {
  const actor = {
    isApiKey: false,
    organizationId: 'org-1',
    scopes: [],
    userId: 'actor-1',
  };

  function fixture(
    workflow: Record<string, unknown> = {},
    options: { cloud?: boolean } = {},
  ) {
    runtime.cloud = options.cloud ?? true;
    const created = createService();
    created.prisma.workflow.findFirst.mockResolvedValue(
      versionedWorkflow({
        brandId: null,
        id: 'wf-1',
        organizationId: 'org-1',
        scheduleInitiatingActor: actor,
        userId: 'creator-1',
        ...workflow,
      }),
    );
    return created;
  }

  function expectHeld(created: ReturnType<typeof fixture>, message: string) {
    expect(
      created.workflowExecutorService.executeManualWorkflowDocument,
    ).not.toHaveBeenCalled();
    // Paused and unbound, keeping the cron and timezone, and the job removed.
    expect(created.prisma.workflow.update).toHaveBeenCalledTimes(1);
    expect(created.prisma.workflow.update).toHaveBeenCalledWith({
      data: {
        isScheduleEnabled: false,
        scheduleInitiatingActor: Prisma.DbNull,
      },
      where: { id: 'wf-1', isDeleted: false, organizationId: 'org-1' },
    });
    expect(created.queueService.removeWorkflowScheduler).toHaveBeenCalledWith(
      'wf-1',
    );
    expect(created.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(message),
      'WorkflowSchedulerService',
    );
  }

  it('runs as the bound actor after a live refresh, not as the workflow creator', async () => {
    const created = fixture();

    await created.service.executeScheduledWorkflow('wf-1', 'fire-1');

    expect(created.prisma.member.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          userId: 'actor-1',
        }),
      }),
    );
    expect(
      created.workflowExecutorService.executeManualWorkflowDocument,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'wf-1' }),
      'actor-1',
      'org-1',
      {},
      { scheduledFireJobId: 'fire-1', triggeredBy: 'schedule' },
      WorkflowExecutionTrigger.SCHEDULED,
    );
    // Only the execution counter write: the schedule is not paused.
    expect(created.prisma.workflow.update).toHaveBeenCalledTimes(1);
    expect(created.prisma.workflow.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isScheduleEnabled: false }),
      }),
    );
  });

  it.each([
    ['no bound actor', null],
    ['an unset actor', undefined],
  ])('holds a Cloud schedule with %s', async (_label, bound) => {
    const created = fixture({ scheduleInitiatingActor: bound });

    await created.service.executeScheduledWorkflow('wf-1', 'fire-1');

    expectHeld(created, 'no authenticated actor');
    expect(created.prisma.member.findFirst).not.toHaveBeenCalled();
  });

  it('holds a schedule bound to an actor from another organization', async () => {
    const created = fixture({
      scheduleInitiatingActor: { ...actor, organizationId: 'org-2' },
    });

    await created.service.executeScheduledWorkflow('wf-1', 'fire-1');

    expectHeld(created, 'no longer has access');
  });

  it.each([
    ['a malformed actor', { userId: 'actor-1' }],
    ['a non-object actor', 'actor-1'],
  ])('holds a schedule with %s', async (_label, bound) => {
    const created = fixture({ scheduleInitiatingActor: bound });

    await created.service.executeScheduledWorkflow('wf-1', 'fire-1');

    expectHeld(created, 'no longer has access');
  });

  it('holds a schedule whose actor is no longer an active member', async () => {
    const created = fixture();
    created.prisma.member.findFirst.mockResolvedValue(null);

    await created.service.executeScheduledWorkflow('wf-1', 'fire-1');

    expectHeld(created, 'no longer has access');
  });

  describe('grandfathered legacy schedule (#6706 data migration)', () => {
    // Exactly the JSON the 20261011130000 migration writes for an owner who is still an active
    // member; the Postgres spec proves that SQL output equals the production save path's value.
    const grandfathered = {
      isApiKey: false,
      organizationId: 'org-1',
      scopes: [],
      userId: 'owner-1',
    };

    it('runs in Cloud as the owner once, after re-checking the owner live', async () => {
      const created = fixture({
        scheduleInitiatingActor: grandfathered,
        userId: 'owner-1',
      });

      await created.service.executeScheduledWorkflow('wf-1', 'fire-1');

      expect(created.prisma.member.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            isDeleted: false,
            organizationId: 'org-1',
            userId: 'owner-1',
          }),
        }),
      );
      expect(
        created.workflowExecutorService.executeManualWorkflowDocument,
      ).toHaveBeenCalledTimes(1);
      expect(
        created.workflowExecutorService.executeManualWorkflowDocument,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'wf-1' }),
        'owner-1',
        'org-1',
        {},
        { scheduledFireJobId: 'fire-1', triggeredBy: 'schedule' },
        WorkflowExecutionTrigger.SCHEDULED,
      );
      expect(created.prisma.workflow.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isScheduleEnabled: false }),
        }),
      );
    });

    it('still holds the row when the owner has left since the migration ran', async () => {
      const created = fixture({
        scheduleInitiatingActor: grandfathered,
        userId: 'owner-1',
      });
      created.prisma.member.findFirst.mockResolvedValue(null);

      await created.service.executeScheduledWorkflow('wf-1', 'fire-1');

      expectHeld(created, 'no longer has access');
    });

    it('still holds a brand workflow the owner can no longer reach', async () => {
      const created = fixture({
        brandId: 'brand-1',
        scheduleInitiatingActor: grandfathered,
        userId: 'owner-1',
      });
      created.prisma.brand.findFirst.mockResolvedValue(null);

      await created.service.executeScheduledWorkflow('wf-1', 'fire-1');

      expectHeld(created, 'no longer has access');
    });
  });

  it('holds a schedule whose API key was revoked or expired', async () => {
    const created = fixture({
      scheduleInitiatingActor: {
        ...actor,
        apiKeyId: 'key-1',
        isApiKey: true,
        scopes: ['workflows:write'],
      },
    });
    created.prisma.apiKey.findFirst.mockResolvedValue(null);

    await created.service.executeScheduledWorkflow('wf-1', 'fire-1');

    expectHeld(created, 'no longer has access');
  });

  it('runs an API key actor as its owning user while the key is valid', async () => {
    const created = fixture({
      scheduleInitiatingActor: {
        ...actor,
        apiKeyId: 'key-1',
        isApiKey: true,
        scopes: ['workflows:write'],
      },
    });
    created.prisma.apiKey.findFirst.mockResolvedValue({
      scopes: ['workflows:write'],
    });

    await created.service.executeScheduledWorkflow('wf-1', 'fire-1');

    expect(
      created.workflowExecutorService.executeManualWorkflowDocument,
    ).toHaveBeenCalledWith(
      expect.anything(),
      'actor-1',
      'org-1',
      expect.anything(),
      expect.anything(),
      WorkflowExecutionTrigger.SCHEDULED,
    );
  });

  it('holds a brand workflow when the actor lost access to that brand', async () => {
    const created = fixture({ brandId: 'brand-1' });
    created.prisma.brand.findFirst.mockResolvedValue(null);

    await created.service.executeScheduledWorkflow('wf-1', 'fire-1');

    expectHeld(created, 'no longer has access');
    expect(created.prisma.brand.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-1' }),
      }),
    );
  });

  it('runs a brand workflow while the actor can still reach the brand', async () => {
    const created = fixture({ brandId: 'brand-1' });

    await created.service.executeScheduledWorkflow('wf-1', 'fire-1');

    expect(
      created.workflowExecutorService.executeManualWorkflowDocument,
    ).toHaveBeenCalledTimes(1);
  });

  it('neither runs nor holds when the authority check itself fails', async () => {
    const created = fixture();
    created.prisma.member.findFirst.mockRejectedValue(new Error('db down'));

    await created.service.executeScheduledWorkflow('wf-1', 'fire-1');

    expect(
      created.workflowExecutorService.executeManualWorkflowDocument,
    ).not.toHaveBeenCalled();
    expect(created.prisma.workflow.update).not.toHaveBeenCalled();
    expect(created.queueService.removeWorkflowScheduler).not.toHaveBeenCalled();
    expect(created.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to execute'),
      expect.any(Error),
      'WorkflowSchedulerService',
    );
  });

  describe('self-hosted single tenant', () => {
    it('keeps running an unbound schedule as the workflow owner', async () => {
      const created = fixture(
        { scheduleInitiatingActor: null },
        { cloud: false },
      );

      await created.service.executeScheduledWorkflow('wf-1', 'fire-1');

      expect(
        created.workflowExecutorService.executeManualWorkflowDocument,
      ).toHaveBeenCalledWith(
        expect.anything(),
        'creator-1',
        'org-1',
        expect.anything(),
        expect.anything(),
        WorkflowExecutionTrigger.SCHEDULED,
      );
      expect(created.prisma.member.findFirst).not.toHaveBeenCalled();
      expect(created.prisma.workflow.update).toHaveBeenCalledTimes(1);
    });

    it('does not check a bound actor either', async () => {
      const created = fixture({}, { cloud: false });
      created.prisma.member.findFirst.mockResolvedValue(null);

      await created.service.executeScheduledWorkflow('wf-1', 'fire-1');

      expect(
        created.workflowExecutorService.executeManualWorkflowDocument,
      ).toHaveBeenCalledWith(
        expect.anything(),
        'creator-1',
        'org-1',
        expect.anything(),
        expect.anything(),
        WorkflowExecutionTrigger.SCHEDULED,
      );
    });
  });
});

describe('WorkflowSchedulerService — seeded platform authority', () => {
  const template = ANALYTICS_SYNC_WORKFLOW_TEMPLATES[0];
  const otherTemplate = ANALYTICS_SYNC_WORKFLOW_TEMPLATES[1];
  const canonicalHash = getPlatformSeedContentHash(template) as string;
  const actor = {
    isApiKey: false,
    organizationId: 'org-1',
    scopes: [],
    userId: 'actor-1',
  };

  function fixture(
    workflow: Record<string, unknown> = {},
    options: { cloud?: boolean } = {},
  ) {
    runtime.cloud = options.cloud ?? true;
    const created = createService();
    created.prisma.workflow.findFirst.mockResolvedValue(
      versionedWorkflow({
        brandId: null,
        contentHash: canonicalHash,
        id: 'wf-1',
        organizationId: 'org-1',
        platformSeedKey: template.id,
        scheduleInitiatingActor: null,
        userId: 'seed-user',
        ...workflow,
      }),
    );
    return created;
  }

  it('has a scheduled canonical template to check against', () => {
    expect(template.schedule).toBeTruthy();
    expect(canonicalHash).toMatch(/^sha256:v1:/);
    expect(getPlatformSeedContentHash(otherTemplate)).not.toBe(canonicalHash);
  });

  it('runs a canonical seeded workflow in Cloud with no actor, as the seeding user', async () => {
    const created = fixture();

    await created.service.executeScheduledWorkflow('wf-1', 'fire-1');

    expect(
      created.workflowExecutorService.executeManualWorkflowDocument,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'wf-1' }),
      'seed-user',
      'org-1',
      {},
      // Nothing platform-side becomes a person: no actor rides the execution metadata.
      { scheduledFireJobId: 'fire-1', triggeredBy: 'schedule' },
      WorkflowExecutionTrigger.SCHEDULED,
    );
    expect(created.prisma.member.findFirst).not.toHaveBeenCalled();
    expect(created.prisma.apiKey.findFirst).not.toHaveBeenCalled();
    // Only the execution counter write: the schedule stays enabled.
    expect(created.prisma.workflow.update).toHaveBeenCalledTimes(1);
    expect(created.queueService.removeWorkflowScheduler).not.toHaveBeenCalled();
  });

  it('ignores a stale actor still bound to the row instead of promoting it', async () => {
    const created = fixture({ scheduleInitiatingActor: actor });
    created.prisma.member.findFirst.mockResolvedValue(null);

    await created.service.executeScheduledWorkflow('wf-1', 'fire-1');

    expect(
      created.workflowExecutorService.executeManualWorkflowDocument,
    ).toHaveBeenCalledWith(
      expect.anything(),
      'seed-user',
      'org-1',
      expect.anything(),
      expect.anything(),
      WorkflowExecutionTrigger.SCHEDULED,
    );
    expect(created.prisma.member.findFirst).not.toHaveBeenCalled();
  });

  it.each([
    [
      'its graph was edited (a newer version with another hash)',
      { contentHash: 'sha256:v1:edited' },
    ],
    ['its version carries no hash', { contentHash: undefined }],
    [
      'it was swapped to another template while keeping the old graph',
      { platformSeedKey: otherTemplate.id },
    ],
    ['its marker names no catalog template', { platformSeedKey: 'forged-key' }],
    ['it was scoped to a brand', { brandId: 'brand-1' }],
  ])(
    'holds and unmarks a marked workflow when %s',
    async (_label, overrides) => {
      const created = fixture(overrides);

      await created.service.executeScheduledWorkflow('wf-1', 'fire-1');

      expect(
        created.workflowExecutorService.executeManualWorkflowDocument,
      ).not.toHaveBeenCalled();
      expect(created.prisma.workflow.update).toHaveBeenCalledTimes(1);
      expect(created.prisma.workflow.update).toHaveBeenCalledWith({
        data: {
          isScheduleEnabled: false,
          platformSeedKey: null,
          scheduleInitiatingActor: Prisma.DbNull,
        },
        where: { id: 'wf-1', isDeleted: false, organizationId: 'org-1' },
      });
      expect(created.queueService.removeWorkflowScheduler).toHaveBeenCalledWith(
        'wf-1',
      );
      expect(created.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'no longer matches its seeded platform template',
        ),
        'WorkflowSchedulerService',
      );
    },
  );

  it('does not let a bound actor rescue a marked workflow that no longer matches', async () => {
    const created = fixture({
      contentHash: 'sha256:v1:edited',
      scheduleInitiatingActor: actor,
    });

    await created.service.executeScheduledWorkflow('wf-1', 'fire-1');

    expect(
      created.workflowExecutorService.executeManualWorkflowDocument,
    ).not.toHaveBeenCalled();
    expect(created.prisma.member.findFirst).not.toHaveBeenCalled();
  });

  it('still requires Automation module access for a platform run', async () => {
    const created = fixture();
    created.moduleAccess.assertAccess.mockRejectedValue(
      new ForbiddenException('Automation requires a subscription'),
    );

    await created.service.executeScheduledWorkflow('wf-1', 'fire-1');

    expect(created.moduleAccess.assertAccess).toHaveBeenCalledWith(
      'org-1',
      'automation',
    );
    expect(
      created.workflowExecutorService.executeManualWorkflowDocument,
    ).not.toHaveBeenCalled();
    expect(created.prisma.workflow.update).not.toHaveBeenCalled();
  });

  it('still pauses a platform run whose required inputs have no defaults, keeping the marker', async () => {
    const created = fixture({
      inputVariables: [{ key: 'accountId', required: true }],
    });

    await created.service.executeScheduledWorkflow('wf-1', 'fire-1');

    expect(
      created.workflowExecutorService.executeManualWorkflowDocument,
    ).not.toHaveBeenCalled();
    expect(created.prisma.workflow.update).toHaveBeenCalledWith({
      data: {
        isScheduleEnabled: false,
        scheduleInitiatingActor: Prisma.DbNull,
      },
      where: { id: 'wf-1', isDeleted: false, organizationId: 'org-1' },
    });
  });

  it('does not validate the marker on self-hosted, which keeps running as the owner', async () => {
    const created = fixture(
      { contentHash: 'sha256:v1:edited' },
      { cloud: false },
    );

    await created.service.executeScheduledWorkflow('wf-1', 'fire-1');

    expect(
      created.workflowExecutorService.executeManualWorkflowDocument,
    ).toHaveBeenCalledWith(
      expect.anything(),
      'seed-user',
      'org-1',
      expect.anything(),
      expect.anything(),
      WorkflowExecutionTrigger.SCHEDULED,
    );
    expect(created.prisma.workflow.update).toHaveBeenCalledTimes(1);
  });

  describe('schedule saves', () => {
    const principal = {
      isApiKey: false,
      organizationId: 'org-1',
      scopes: [],
      userId: 'user-1',
    };

    function savedWorkflow() {
      return versionedWorkflow({
        id: 'wf-1',
        isScheduleEnabled: true,
        schedule: '0 7 * * *',
        timezone: 'UTC',
      });
    }

    function writtenData(prisma: ReturnType<typeof createMockPrisma>) {
      const [args] = prisma.workflow.update.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      return args.data;
    }

    function existingSeed(contentHash: string) {
      return {
        brandId: null,
        currentVersion: { contentHash },
        id: 'wf-1',
        platformSeedKey: template.id,
      };
    }

    it('keeps the marker and leaves the saver out of a canonical seeded workflow', async () => {
      const prisma = createMockPrisma();
      prisma.workflow.findFirst.mockResolvedValue(existingSeed(canonicalHash));
      prisma.workflow.update.mockResolvedValue(savedWorkflow());
      const { service } = createService({ prisma });

      await service.updateSchedule(
        'wf-1',
        'org-1',
        '0 7 * * *',
        'UTC',
        true,
        principal,
      );

      const data = writtenData(prisma);
      expect(data.scheduleInitiatingActor).toBe(Prisma.DbNull);
      expect(data).not.toHaveProperty('platformSeedKey');
      expect(data).toMatchObject({
        isScheduleEnabled: true,
        schedule: '0 7 * * *',
        timezone: 'UTC',
      });
    });

    it('keeps the marker when a canonical seeded workflow is paused', async () => {
      const prisma = createMockPrisma();
      prisma.workflow.findFirst.mockResolvedValue(existingSeed(canonicalHash));
      prisma.workflow.update.mockResolvedValue(savedWorkflow());
      const { service } = createService({ prisma });

      await service.updateSchedule(
        'wf-1',
        'org-1',
        '0 7 * * *',
        'UTC',
        false,
        principal,
      );

      expect(writtenData(prisma)).not.toHaveProperty('platformSeedKey');
    });

    it('drops a marker that no longer matches its template and binds the saver', async () => {
      const prisma = createMockPrisma();
      prisma.workflow.findFirst.mockResolvedValue(
        existingSeed('sha256:v1:edited'),
      );
      prisma.workflow.update.mockResolvedValue(savedWorkflow());
      const { service } = createService({ prisma });

      await service.updateSchedule(
        'wf-1',
        'org-1',
        '0 7 * * *',
        'UTC',
        true,
        principal,
      );

      const data = writtenData(prisma);
      expect(data.platformSeedKey).toBeNull();
      expect(data.scheduleInitiatingActor).toEqual(
        expect.objectContaining({ userId: 'user-1' }),
      );
    });
  });
});

describe('WorkflowSchedulerService — automatic platform seed marking (#6689)', () => {
  const template = ANALYTICS_SYNC_WORKFLOW_TEMPLATES[0];
  const canonicalHash = getPlatformSeedContentHash(template) as string;
  const ownerActor = {
    isApiKey: false,
    organizationId: 'org-1',
    scopes: [],
    userId: 'owner-1',
  };

  function fixture(
    workflow: Record<string, unknown> = {},
    options: { cloud?: boolean } = {},
  ) {
    runtime.cloud = options.cloud ?? true;
    const created = createService();
    const seeded = {
      brandId: null,
      contentHash: canonicalHash,
      id: 'wf-1',
      metadata: {
        sourceTemplateId: template.id,
        sourceType: 'seeded-template',
      },
      organizationId: 'org-1',
      platformSeedKey: null,
      scheduleInitiatingActor: null,
      templateInstantiationKey: null,
      userId: 'owner-1',
      ...workflow,
    };
    created.prisma.workflow.findFirst.mockResolvedValue(
      versionedWorkflow(seeded),
    );
    // The reconcile re-reads its candidates: the same row, as the database returns it.
    const reconcileRow = {
      brandId: seeded.brandId,
      currentVersion: { contentHash: seeded.contentHash },
      currentVersionId: 'wf-1-version-1',
      id: 'wf-1',
      isScheduleEnabled: true,
      metadata: seeded.metadata,
      platformSeedKey: null,
      templateInstantiationKey: null,
      updatedAt: new Date('2026-10-01T00:00:00Z'),
      userId: seeded.userId,
    };
    const { prisma } = created;
    prisma.workflow.findMany.mockResolvedValue([reconcileRow]);
    prisma.workflow.updateMany.mockResolvedValue({ count: 1 });
    // The organization owner is an active member (the same row also satisfies a live actor
    // refresh, which reads the member's brands and role).
    prisma.member.findFirst.mockResolvedValue({
      brands: [],
      role: { key: MemberRole.ADMIN },
      userId: 'owner-1',
    });
    return created;
  }

  function runAs(created: ReturnType<typeof fixture>) {
    return created.workflowExecutorService.executeManualWorkflowDocument;
  }

  it('marks an unmarked canonical seed and runs it as the platform with no actor', async () => {
    const created = fixture();

    await created.service.executeScheduledWorkflow('wf-1', 'fire-1');

    expect(created.prisma.workflow.updateMany).toHaveBeenCalledWith({
      data: {
        platformSeedKey: template.id,
        scheduleInitiatingActor: Prisma.DbNull,
      },
      where: expect.objectContaining({ id: 'wf-1', platformSeedKey: null }),
    });
    expect(runAs(created)).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'wf-1' }),
      'owner-1',
      'org-1',
      {},
      { scheduledFireJobId: 'fire-1', triggeredBy: 'schedule' },
      WorkflowExecutionTrigger.SCHEDULED,
    );
    // Not held, not paused: only the execution counter write.
    expect(created.prisma.workflow.update).toHaveBeenCalledTimes(1);
    expect(created.queueService.removeWorkflowScheduler).not.toHaveBeenCalled();
    // Only the owner lookup; no live actor refresh ran.
    expect(created.prisma.member.findFirst).toHaveBeenCalledTimes(1);
  });

  it('replaces the owner actor the grandfather migration bound', async () => {
    const created = fixture({ scheduleInitiatingActor: ownerActor });

    await created.service.executeScheduledWorkflow('wf-1', 'fire-1');

    expect(created.prisma.workflow.updateMany).toHaveBeenCalledTimes(1);
    expect(runAs(created)).toHaveBeenCalledWith(
      expect.anything(),
      'owner-1',
      'org-1',
      expect.anything(),
      expect.anything(),
      WorkflowExecutionTrigger.SCHEDULED,
    );
    expect(created.prisma.member.findFirst).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['edited (another version hash)', { contentHash: 'sha256:v1:edited' }],
    [
      'forged metadata without the seeder provenance',
      { metadata: { sourceTemplateId: template.id } },
    ],
    ['scoped to a brand', { brandId: 'brand-1' }],
    ['a tenant template install', { templateInstantiationKey: 'attempt-1' }],
  ])(
    'leaves a workflow alone and holds it when it is %s',
    async (_label, overrides) => {
      const created = fixture(overrides);

      await created.service.executeScheduledWorkflow('wf-1', 'fire-1');

      expect(created.prisma.workflow.findMany).not.toHaveBeenCalled();
      expect(created.prisma.workflow.updateMany).not.toHaveBeenCalled();
      expect(runAs(created)).not.toHaveBeenCalled();
      expect(created.prisma.workflow.update).toHaveBeenCalledWith({
        data: {
          isScheduleEnabled: false,
          scheduleInitiatingActor: Prisma.DbNull,
        },
        where: { id: 'wf-1', isDeleted: false, organizationId: 'org-1' },
      });
    },
  );

  it('does not mark a row owned by a member who is not the organization owner', async () => {
    const created = fixture({ userId: 'member-2' });
    created.prisma.member.findFirst.mockResolvedValue(null);

    await created.service.executeScheduledWorkflow('wf-1', 'fire-1');

    expect(created.prisma.workflow.updateMany).not.toHaveBeenCalled();
    expect(runAs(created)).not.toHaveBeenCalled();
    expect(created.queueService.removeWorkflowScheduler).toHaveBeenCalledWith(
      'wf-1',
    );
  });

  it('keeps a member-bound schedule on that member instead of the platform', async () => {
    const created = fixture({
      scheduleInitiatingActor: { ...ownerActor, userId: 'member-2' },
    });
    created.prisma.member.findFirst.mockResolvedValue({
      brands: [],
      role: { key: MemberRole.ADMIN },
    });

    await created.service.executeScheduledWorkflow('wf-1', 'fire-1');

    expect(created.prisma.workflow.updateMany).not.toHaveBeenCalled();
    expect(runAs(created)).toHaveBeenCalledWith(
      expect.anything(),
      'member-2',
      'org-1',
      expect.anything(),
      expect.anything(),
      WorkflowExecutionTrigger.SCHEDULED,
    );
  });

  it('falls back to the actor rules when it loses the race to a concurrent edit', async () => {
    const created = fixture({ scheduleInitiatingActor: ownerActor });
    created.prisma.workflow.updateMany.mockResolvedValue({ count: 0 });

    await created.service.executeScheduledWorkflow('wf-1', 'fire-1');

    // Still the owner, re-checked live as an actor: the pre-release behaviour.
    expect(runAs(created)).toHaveBeenCalledWith(
      expect.anything(),
      'owner-1',
      'org-1',
      expect.anything(),
      expect.anything(),
      WorkflowExecutionTrigger.SCHEDULED,
    );
    expect(created.prisma.member.findFirst).toHaveBeenCalledTimes(2);
  });

  it('keeps running on the actor rules when the reconcile itself fails', async () => {
    const created = fixture({ scheduleInitiatingActor: ownerActor });
    created.prisma.workflow.findMany.mockRejectedValue(
      new Error('connection lost'),
    );

    await created.service.executeScheduledWorkflow('wf-1', 'fire-1');

    expect(runAs(created)).toHaveBeenCalledTimes(1);
    expect(created.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Could not reconcile'),
      expect.objectContaining({ workflowId: 'wf-1' }),
    );
  });

  it('does nothing on self-hosted, which keeps running as the owner', async () => {
    const created = fixture({}, { cloud: false });

    await created.service.executeScheduledWorkflow('wf-1', 'fire-1');

    expect(created.prisma.member.findFirst).not.toHaveBeenCalled();
    expect(created.prisma.workflow.findMany).not.toHaveBeenCalled();
    expect(created.prisma.workflow.updateMany).not.toHaveBeenCalled();
    expect(runAs(created)).toHaveBeenCalledWith(
      expect.anything(),
      'owner-1',
      'org-1',
      expect.anything(),
      expect.anything(),
      WorkflowExecutionTrigger.SCHEDULED,
    );
  });
});
