import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { WorkflowStatus } from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('WorkflowsService seeded livestream bot workflows', () => {
  const tx = {
    workflow: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
  };
  const prisma = {
    $transaction: vi.fn(),
    organization: {
      findFirst: vi.fn(),
    },
    task: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    taskCounter: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    workflow: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  let service: WorkflowsService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.workflow.findFirst.mockResolvedValue(null);
    prisma.workflow.create.mockResolvedValue({
      edges: [],
      id: 'workflow-1',
      inputVariables: [],
      isDeleted: false,
      label: 'Daily Trend Loop',
      metadata: {
        routine: {
          routineId: 'daily-trend-loop',
          routineName: 'Daily Trend Loop',
        },
        sourceTemplateId: 'daily-trend-loop',
        sourceType: 'seeded-template',
      },
      nodes: [],
      organizationId: 'org-1',
      status: 'active',
      steps: [],
      userId: 'user-1',
    });
    prisma.workflow.update.mockImplementation(async ({ data }) => ({
      edges: [],
      id: 'workflow-1',
      inputVariables: [],
      isDeleted: false,
      label: 'Daily Trend Loop',
      metadata: data.metadata,
      nodes: [],
      organizationId: 'org-1',
      status: 'active',
      steps: [],
      userId: 'user-1',
    }));
    prisma.organization.findFirst.mockResolvedValue({ prefix: 'GEN' });
    prisma.task.findMany.mockResolvedValue([]);
    prisma.task.create.mockImplementation(async ({ data }) => ({
      config: data.config,
      id: `task-${prisma.task.create.mock.calls.length}`,
      status: data.status,
      title: data.title,
    }));
    prisma.taskCounter.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ counter: 1, id: 'counter-1' });
    prisma.taskCounter.create.mockResolvedValue({
      counter: 1,
      id: 'counter-1',
    });
    prisma.taskCounter.update
      .mockResolvedValueOnce({ counter: 2, id: 'counter-1' })
      .mockResolvedValueOnce({ counter: 3, id: 'counter-1' })
      .mockResolvedValue({ counter: 4, id: 'counter-1' });
    tx.workflow.findFirst.mockResolvedValue(null);
    tx.workflow.create.mockResolvedValue({});
    prisma.$transaction.mockImplementation(
      async (
        callback: (transactionClient: typeof tx) => Promise<void>,
      ): Promise<void> => callback(tx),
    );

    service = new WorkflowsService(prisma as never, logger as never);
  });

  it('seeds the livestream bot workflow default-on for an organization', async () => {
    await service.ensureLivestreamBotWorkflows('user-1', 'org-1');

    expect(tx.workflow.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        isScheduleEnabled: true,
        label: 'Livestream Bot Session Processing',
        metadata: {
          sourceIssue: 793,
          sourceTemplateId: 'livestream-bot-session-processing',
          sourceType: 'seeded-template',
        },
        organizationId: 'org-1',
        schedule: '*/1 * * * *',
        status: WorkflowStatus.ACTIVE,
        timezone: 'UTC',
        userId: 'user-1',
      }),
    });
    expect(tx.workflow.create.mock.calls[0][0].data.nodes).toEqual([
      expect.objectContaining({
        id: 'livestreamBotSessionProcessing',
        type: 'livestreamBotSessionProcessing',
      }),
    ]);
  });

  it('does not seed a duplicate livestream bot workflow', async () => {
    prisma.workflow.findFirst.mockResolvedValue({ id: 'workflow-1' });

    await service.ensureLivestreamBotWorkflows('user-1', 'org-1');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.workflow.create).not.toHaveBeenCalled();
  });

  it('installs productized routines with tracking tasks instead of auto-running', async () => {
    const executeSpy = vi
      .spyOn(service, 'executeWorkflowCompat')
      .mockResolvedValue({ mode: 'legacy' });

    await service.createWorkflow('user-1', 'org-1', {
      label: 'Daily Trend Loop',
      templateId: 'daily-trend-loop',
      trigger: 'manual',
    } as never);

    expect(prisma.workflow.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        isScheduleEnabled: true,
        metadata: expect.objectContaining({
          routine: expect.objectContaining({
            routineId: 'daily-trend-loop',
            sourceIssue: 224,
          }),
          sourceTemplateId: 'daily-trend-loop',
        }),
        schedule: '0 8 * * *',
        timezone: 'UTC',
      }),
    });
    expect(prisma.task.create).toHaveBeenCalledTimes(3);
    expect(prisma.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        config: expect.objectContaining({
          identifier: 'GEN-1',
          linkedEntities: [
            {
              entityId: 'workflow-1',
              entityModel: 'Workflow',
            },
          ],
          routine: expect.objectContaining({
            templateId: 'daily-trend-loop',
            workflowId: 'workflow-1',
          }),
        }),
        status: 'todo',
        title: 'Confirm Daily Trend Loop inputs',
      }),
    });
    expect(prisma.workflow.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          routine: expect.objectContaining({
            trackingTaskIds: ['task-1', 'task-2', 'task-3'],
          }),
        }),
      }),
      where: { id: 'workflow-1' },
    });
    expect(executeSpy).not.toHaveBeenCalled();
  });
});
