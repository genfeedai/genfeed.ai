import {
  SYSTEM_WORKFLOW_ACTION_IDS,
  SystemWorkflowProvenanceService,
} from '@api/collections/workflows/services/system-workflow-provenance.service';
import { SYSTEM_WORKFLOW_METADATA_KEY } from '@api/collections/workflows/system-workflow.contract';
import { WorkflowExecutionTrigger } from '@genfeedai/enums';
import { WorkflowExecutionStatus as PrismaWorkflowExecutionStatus } from '@genfeedai/prisma';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('SystemWorkflowProvenanceService', () => {
  const mockPrisma = {
    $transaction: vi.fn(
      async (callback: (tx: unknown) => Promise<Record<string, unknown>>) =>
        callback(mockPrisma),
    ),
    organization: {
      findUnique: vi.fn(),
    },
    post: {
      updateMany: vi.fn(),
    },
    workflow: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    workflowExecution: {
      create: vi.fn(),
      update: vi.fn(),
    },
  };

  const mockLogger = {
    warn: vi.fn(),
  };

  let service: SystemWorkflowProvenanceService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SystemWorkflowProvenanceService(
      mockPrisma as never,
      mockLogger as never,
    );

    mockPrisma.workflowExecution.create.mockResolvedValue({
      id: 'execution-1',
    });
    mockPrisma.workflowExecution.update.mockResolvedValue({});
    mockPrisma.workflow.update.mockResolvedValue({});
    mockPrisma.post.updateMany.mockResolvedValue({ count: 1 });
  });

  it('creates a system workflow, records an execution, and links posts', async () => {
    mockPrisma.workflow.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mockPrisma.workflow.create.mockResolvedValue({
      id: 'workflow-1',
      label: 'Scheduled Post Publishing',
    });

    const action = vi.fn(async () => ({
      externalId: 'external-1',
      success: true,
    }));

    const result = await service.runAction(
      {
        actionType: 'publish-post',
        canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.SCHEDULED_POST_PUBLISHING,
        description: 'Publish scheduled posts.',
        label: 'Scheduled Post Publishing',
        organizationId: 'org-1',
        postIds: ['post-1'],
        schedule: '*/15 * * * *',
        source: 'CronPostsService.publishSinglePost',
        trigger: WorkflowExecutionTrigger.SCHEDULED,
        userId: 'user-1',
      },
      action,
    );

    expect(result.provenance).toEqual({
      executionId: 'execution-1',
      workflowId: 'workflow-1',
      workflowLabel: 'Scheduled Post Publishing',
    });
    expect(action).toHaveBeenCalledWith(result.provenance);
    expect(mockPrisma.workflow.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isScheduleEnabled: true,
          metadata: expect.objectContaining({
            sourceTemplateId:
              SYSTEM_WORKFLOW_ACTION_IDS.SCHEDULED_POST_PUBLISHING,
            [SYSTEM_WORKFLOW_METADATA_KEY]: expect.objectContaining({
              canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.SCHEDULED_POST_PUBLISHING,
              immutable: true,
            }),
          }),
          schedule: '*/15 * * * *',
        }),
      }),
    );
    expect(mockPrisma.workflowExecution.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-1',
          status: PrismaWorkflowExecutionStatus.RUNNING,
          trigger: WorkflowExecutionTrigger.SCHEDULED,
          userId: 'user-1',
          workflowId: 'workflow-1',
        }),
      }),
    );
    expect(mockPrisma.post.updateMany).toHaveBeenCalledWith({
      data: {
        sourceWorkflowId: 'workflow-1',
        sourceWorkflowName: 'Scheduled Post Publishing',
        workflowExecutionId: 'execution-1',
      },
      where: { id: { in: ['post-1'] } },
    });
    expect(mockPrisma.workflowExecution.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PrismaWorkflowExecutionStatus.COMPLETED,
        }),
        where: { id: 'execution-1' },
      }),
    );
    expect(mockPrisma.workflow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          executionCount: { increment: 1 },
        }),
        where: { id: 'workflow-1' },
      }),
    );
  });

  it('marks the execution failed when the action result reports failure', async () => {
    mockPrisma.workflow.findFirst.mockResolvedValue({
      id: 'workflow-1',
      label: 'Twitter Publish Action',
    });

    await service.runAction(
      {
        actionType: 'twitter-original',
        canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.TWITTER_PUBLISH_ACTION,
        description: 'Publish Twitter actions.',
        failureMessage: (result) => (result.success ? undefined : result.error),
        label: 'Twitter Publish Action',
        organizationId: 'org-1',
        source: 'TwitterPipelineService.publish',
        userId: 'user-1',
      },
      async () => ({ error: 'Rate limited', success: false }),
    );

    expect(mockPrisma.workflow.create).not.toHaveBeenCalled();
    expect(mockPrisma.workflowExecution.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          error: 'Rate limited',
          status: PrismaWorkflowExecutionStatus.FAILED,
        }),
      }),
    );
  });
});
