import { WorkflowSchedulerService } from '@api/collections/workflows/services/workflow-scheduler.service';
import { WorkflowExecutionTrigger } from '@genfeedai/enums';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ExecuteScheduledWorkflow = {
  executeScheduledWorkflow(workflowId: string): Promise<void>;
};

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

function createMockCacheService() {
  return {
    acquireLock: vi.fn().mockResolvedValue(true),
    releaseLock: vi.fn().mockResolvedValue(true),
  };
}

function createService(overrides: {
  prisma?: ReturnType<typeof createMockPrisma>;
  cacheService?: ReturnType<typeof createMockCacheService>;
  workflowExecutorService?: { executeManualWorkflow: ReturnType<typeof vi.fn> };
}) {
  const prisma = overrides.prisma ?? createMockPrisma();
  const logger = createMockLogger();
  const schedulerRegistry = {
    addCronJob: vi.fn(),
    deleteCronJob: vi.fn(),
  };
  const configService = { isDevSchedulersEnabled: false };
  const workflowsService = { executeWorkflow: vi.fn().mockResolvedValue({}) };
  const workflowExecutionsService = {
    createExecution: vi.fn().mockResolvedValue({}),
  };
  const workflowExecutorService = overrides.workflowExecutorService ?? {
    executeManualWorkflow: vi.fn().mockResolvedValue({}),
  };
  const cacheService = overrides.cacheService ?? createMockCacheService();

  const service = new (
    WorkflowSchedulerService as unknown as new (
      ...args: unknown[]
    ) => WorkflowSchedulerService
  )(
    prisma,
    logger,
    schedulerRegistry,
    configService,
    workflowsService,
    workflowExecutionsService,
    workflowExecutorService,
    cacheService,
  );

  return {
    cacheService,
    logger,
    prisma,
    service,
    workflowExecutorService,
    workflowExecutionsService,
    workflowsService,
  };
}

describe('WorkflowSchedulerService — scheduled fire locking', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-02T10:00:30.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('skips the fire entirely when another instance holds the fire-window lock', async () => {
    const cacheService = createMockCacheService();
    cacheService.acquireLock.mockResolvedValue(false);
    const { prisma, service } = createService({ cacheService });

    await (
      service as unknown as ExecuteScheduledWorkflow
    ).executeScheduledWorkflow('wf-1');

    expect(cacheService.acquireLock).toHaveBeenCalledTimes(1);
    expect(prisma.workflow.findFirst).not.toHaveBeenCalled();
    expect(prisma.workflow.update).not.toHaveBeenCalled();
  });

  it('claims a per-workflow, per-minute-bucket lock and never releases it early', async () => {
    const cacheService = createMockCacheService();
    const { service } = createService({ cacheService });

    await (
      service as unknown as ExecuteScheduledWorkflow
    ).executeScheduledWorkflow('wf-1');

    const expectedBucket = Math.floor(
      new Date('2026-07-02T10:00:30.000Z').getTime() / 60_000,
    );
    expect(cacheService.acquireLock).toHaveBeenCalledWith(
      `workflow-schedule-fire:wf-1:${expectedBucket}`,
      600,
    );
    expect(cacheService.releaseLock).not.toHaveBeenCalled();
  });

  it('proceeds with execution when the lock is acquired (node-based workflow)', async () => {
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
    };
    const { service } = createService({ prisma, workflowExecutorService });

    await (
      service as unknown as ExecuteScheduledWorkflow
    ).executeScheduledWorkflow('wf-1');

    expect(prisma.workflow.update).toHaveBeenCalledTimes(1);
    expect(workflowExecutorService.executeManualWorkflow).toHaveBeenCalledWith(
      'wf-1',
      'user-1',
      'org-1',
      {},
      { triggeredBy: 'schedule' },
      WorkflowExecutionTrigger.SCHEDULED,
    );
  });

  it('does not execute a workflow that is missing or inactive, even with the lock', async () => {
    const prisma = createMockPrisma();
    prisma.workflow.findFirst.mockResolvedValue(null);
    const workflowExecutorService = {
      executeManualWorkflow: vi.fn().mockResolvedValue({}),
    };
    const { logger, service } = createService({
      prisma,
      workflowExecutorService,
    });

    await (
      service as unknown as ExecuteScheduledWorkflow
    ).executeScheduledWorkflow('wf-gone');

    expect(
      workflowExecutorService.executeManualWorkflow,
    ).not.toHaveBeenCalled();
    expect(prisma.workflow.update).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });
});
