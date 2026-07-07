import type { WorkflowDocument } from '@api/collections/workflows/schemas/workflow.schema';
import { EXECUTABLE_WORKFLOW_SELECT } from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowSchedulerService } from '@api/collections/workflows/services/workflow-scheduler.service';
import { buildSystemWorkflowMetadata } from '@api/collections/workflows/system-workflow.contract';
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
  const workflowsService = { executeWorkflow: vi.fn().mockResolvedValue({}) };
  const workflowExecutionsService = {
    createExecution: vi.fn().mockResolvedValue({}),
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
  )(
    prisma,
    logger,
    configService,
    workflowsService,
    workflowExecutionsService,
    workflowExecutorService,
    queueService,
  );

  return {
    logger,
    prisma,
    queueService,
    service,
    workflowExecutionsService,
    workflowExecutorService,
    workflowsService,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('WorkflowSchedulerService — job scheduler registration', () => {
  it('never registers job schedulers for system workflows (their actions fire from the workers sweep scheduler)', async () => {
    const { queueService, service } = createService({});

    await service.scheduleWorkflow({
      id: 'wf-system',
      isScheduleEnabled: true,
      metadata: {
        systemWorkflow: buildSystemWorkflowMetadata({
          canonicalId: 'scheduled-post-publishing',
        }),
      },
      schedule: '*/15 * * * *',
    } as unknown as WorkflowDocument);

    expect(queueService.upsertWorkflowScheduler).not.toHaveBeenCalled();
    expect(queueService.removeWorkflowScheduler).toHaveBeenCalledWith(
      'wf-system',
    );
  });

  it('upserts a BullMQ job scheduler when a schedule is set and enabled', async () => {
    const prisma = createMockPrisma();
    prisma.workflow.findFirst.mockResolvedValue({ id: 'wf-1' });
    prisma.workflow.update.mockResolvedValue({
      id: 'wf-1',
      isScheduleEnabled: true,
      schedule: '0 7 * * *',
      timezone: 'Europe/Amsterdam',
    });
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
    prisma.workflow.update.mockResolvedValue({
      id: 'wf-1',
      isScheduleEnabled: false,
      schedule: '0 7 * * *',
    });
    const { queueService, service } = createService({ prisma });

    await service.updateSchedule('wf-1', '0 7 * * *', 'UTC', false);

    expect(queueService.removeWorkflowScheduler).toHaveBeenCalledWith('wf-1');
    expect(queueService.upsertWorkflowScheduler).not.toHaveBeenCalled();
  });

  it('removes the job scheduler when the schedule is cleared', async () => {
    const prisma = createMockPrisma();
    prisma.workflow.findFirst.mockResolvedValue({ id: 'wf-1' });
    prisma.workflow.update.mockResolvedValue({
      id: 'wf-1',
      isScheduleEnabled: false,
      schedule: null,
    });
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
        metadata: true,
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
    prisma.workflow.findFirst.mockResolvedValue({
      id: 'wf-1',
      inputVariables: [],
      nodes: [{ id: 'node-1' }],
      organizationId: 'org-1',
      userId: 'user-1',
    });
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

  it('skips scheduled node execution when required input defaults are missing', async () => {
    const prisma = createMockPrisma();
    prisma.workflow.findFirst.mockResolvedValue({
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
    });
    const workflowExecutorService = {
      executeManualWorkflow: vi.fn().mockResolvedValue({}),
      executeManualWorkflowDocument: vi.fn().mockResolvedValue({}),
    };
    const { logger, service } = createService({
      prisma,
      workflowExecutorService,
    });

    await service.executeScheduledWorkflow('wf-1');

    expect(prisma.workflow.update).not.toHaveBeenCalled();
    expect(
      workflowExecutorService.executeManualWorkflowDocument,
    ).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('titleText'),
      'WorkflowSchedulerService',
    );
  });

  it('creates an execution record for legacy step-based workflows', async () => {
    const prisma = createMockPrisma();
    prisma.workflow.findFirst.mockResolvedValue({
      id: 'wf-legacy',
      inputVariables: [],
      nodes: [],
      organizationId: 'org-1',
      userId: 'user-1',
    });
    const { service, workflowExecutionsService, workflowsService } =
      createService({ prisma });

    await service.executeScheduledWorkflow('wf-legacy');

    expect(workflowExecutionsService.createExecution).toHaveBeenCalledWith(
      'user-1',
      'org-1',
      expect.objectContaining({
        trigger: WorkflowExecutionTrigger.SCHEDULED,
        workflow: 'wf-legacy',
      }),
    );
    expect(workflowsService.executeWorkflow).toHaveBeenCalledWith('wf-legacy');
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

  it('removes the job scheduler for systemic templates without user/org', async () => {
    const prisma = createMockPrisma();
    prisma.workflow.findFirst.mockResolvedValue({
      id: 'wf-template',
      inputVariables: [],
      nodes: [{ id: 'node-1' }],
      organizationId: null,
      userId: null,
    });
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
