import type { WorkflowDocument } from '@api/collections/workflows/schemas/workflow.schema';
import { EXECUTABLE_WORKFLOW_SELECT } from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowSchedulerService } from '@api/collections/workflows/services/workflow-scheduler.service';
import { WorkflowExecutionTrigger, WorkflowStatus } from '@genfeedai/enums';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
    workflow: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
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
  id: string;
  inputVariables?: unknown[];
  nodes?: unknown[];
  organizationId?: string | null;
  userId?: string | null;
  [key: string]: unknown;
}) {
  const { inputVariables = [], nodes = [], ...identity } = input;

  return {
    ...identity,
    currentVersion: {
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

  const service = new (
    WorkflowSchedulerService as unknown as new (
      ...args: unknown[]
    ) => WorkflowSchedulerService
  )(prisma, logger, configService, workflowExecutorService, queueService);

  return {
    logger,
    prisma,
    queueService,
    service,
    workflowExecutorService,
  };
}

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

    await service.updateSchedule('wf-1', '0 7 * * *', 'UTC', false);

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

    await service.updateSchedule('wf-1', null, 'UTC', true);

    expect(queueService.removeWorkflowScheduler).toHaveBeenCalledWith('wf-1');
  });

  it('returns null without touching schedulers for a missing workflow', async () => {
    const { prisma, queueService, service } = createService();
    prisma.workflow.findFirst.mockResolvedValue(null);

    const updated = await service.updateSchedule('wf-gone', '0 7 * * *');

    expect(updated).toBeNull();
    expect(queueService.upsertWorkflowScheduler).not.toHaveBeenCalled();
    expect(queueService.removeWorkflowScheduler).not.toHaveBeenCalled();
  });

  it('rejects an invalid cron expression before persistence', async () => {
    const prisma = createMockPrisma();
    prisma.workflow.findFirst.mockResolvedValue({ id: 'wf-1' });
    const { queueService, service } = createService({ prisma });

    await expect(
      service.updateSchedule('wf-1', 'not a cron', 'UTC', true),
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
      service.updateSchedule('wf-1', '0 7 * * *', 'Mars/Olympus', true),
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
      service.updateSchedule('wf-1', '0 7 * * *', 'UTC', true),
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

    await service.executeScheduledWorkflow('wf-1');

    expect(prisma.workflow.findFirst).toHaveBeenCalledWith({
      select: EXECUTABLE_WORKFLOW_SELECT,
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
      { triggeredBy: 'schedule' },
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
      data: { isScheduleEnabled: false },
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
