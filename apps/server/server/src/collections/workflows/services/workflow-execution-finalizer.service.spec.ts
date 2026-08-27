import { WorkflowExecutionFinalizerService } from '@server/collections/workflows/services/workflow-execution-finalizer.service';
import {
  WorkflowExecutionStatus,
  WorkflowExecutionTrigger,
  WorkflowStatus,
} from '@genfeedai/enums';
import type { ExecutionRunResult } from '@genfeedai/workflows/engine';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function failedRunResult(error = 'node exploded'): ExecutionRunResult {
  return {
    completedAt: new Date('2026-08-14T08:00:00.000Z'),
    error,
    nodeResults: new Map(),
    runId: 'run-1',
    startedAt: new Date('2026-08-14T07:55:00.000Z'),
    status: 'failed',
    totalCreditsUsed: 0,
    workflowId: 'wf-1',
  };
}

describe('WorkflowExecutionFinalizerService scheduled failure notice', () => {
  const prisma = {
    workflow: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };
  const executionsService = {
    completeExecution: vi.fn(),
  };
  const graphService = {
    findFirstFailedNodeId: vi.fn(),
  };
  const notificationsPublisher = {
    publishNotification: vi.fn(),
    publishWorkflowStatus: vi.fn(),
  };
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  let service: WorkflowExecutionFinalizerService;

  beforeEach(() => {
    vi.clearAllMocks();
    graphService.findFirstFailedNodeId.mockReturnValue('node-1');
    prisma.workflow.update.mockResolvedValue({});
    prisma.workflow.findFirst.mockResolvedValue({ label: 'Morning digest' });
    notificationsPublisher.publishNotification.mockResolvedValue(undefined);
    notificationsPublisher.publishWorkflowStatus.mockResolvedValue(undefined);

    service = new WorkflowExecutionFinalizerService(
      prisma as never,
      executionsService as never,
      graphService as never,
      notificationsPublisher as never,
      logger as never,
    );
  });

  it('publishes an in-app notice and workflow-status email path on scheduled failure', async () => {
    executionsService.completeExecution.mockResolvedValue({
      id: 'exec-1',
      organizationId: 'org-1',
      trigger: WorkflowExecutionTrigger.SCHEDULED,
      userId: 'user-1',
      workflowId: 'wf-1',
    });

    await service.finalizeExecution({
      completedAt: new Date('2026-08-14T08:00:00.000Z'),
      executionId: 'exec-1',
      finalStatus: WorkflowExecutionStatus.FAILED,
      result: failedRunResult(),
      workflowId: 'wf-1',
      workflowStatus: WorkflowStatus.FAILED,
    });

    expect(notificationsPublisher.publishNotification).toHaveBeenCalledWith({
      notification: {
        link: '/automate/workflows/executions/exec-1',
        message: 'Morning digest failed during a scheduled run: node exploded',
        metadata: {
          executionId: 'exec-1',
          trigger: WorkflowExecutionTrigger.SCHEDULED,
          workflowId: 'wf-1',
        },
        title: 'Scheduled workflow failed',
        type: 'workflow_scheduled_failed',
      },
      organizationId: 'org-1',
      userId: 'user-1',
    });
    expect(notificationsPublisher.publishWorkflowStatus).toHaveBeenCalledWith(
      'wf-1',
      'failed',
      'user-1',
      {
        error: 'node exploded',
        workflowLabel: 'Morning digest',
      },
    );
  });

  it('does not notify on a manual failure', async () => {
    executionsService.completeExecution.mockResolvedValue({
      id: 'exec-2',
      organizationId: 'org-1',
      trigger: WorkflowExecutionTrigger.MANUAL,
      userId: 'user-1',
      workflowId: 'wf-1',
    });

    await service.finalizeExecution({
      completedAt: new Date('2026-08-14T08:00:00.000Z'),
      executionId: 'exec-2',
      finalStatus: WorkflowExecutionStatus.FAILED,
      result: failedRunResult(),
      workflowId: 'wf-1',
      workflowStatus: WorkflowStatus.FAILED,
    });

    expect(notificationsPublisher.publishNotification).not.toHaveBeenCalled();
    expect(notificationsPublisher.publishWorkflowStatus).not.toHaveBeenCalled();
  });

  it('does not notify on a scheduled completion', async () => {
    executionsService.completeExecution.mockResolvedValue({
      id: 'exec-3',
      organizationId: 'org-1',
      trigger: WorkflowExecutionTrigger.SCHEDULED,
      userId: 'user-1',
      workflowId: 'wf-1',
    });

    await service.finalizeExecution({
      completedAt: new Date('2026-08-14T08:00:00.000Z'),
      executionId: 'exec-3',
      finalStatus: WorkflowExecutionStatus.COMPLETED,
      result: {
        ...failedRunResult(),
        error: undefined,
        status: 'completed',
      },
      workflowId: 'wf-1',
      workflowStatus: WorkflowStatus.ACTIVE,
    });

    expect(notificationsPublisher.publishNotification).not.toHaveBeenCalled();
    expect(notificationsPublisher.publishWorkflowStatus).not.toHaveBeenCalled();
  });

  it('does not fail finalization when notification publish throws', async () => {
    executionsService.completeExecution.mockResolvedValue({
      id: 'exec-4',
      organizationId: 'org-1',
      trigger: WorkflowExecutionTrigger.SCHEDULED,
      userId: 'user-1',
      workflowId: 'wf-1',
    });
    notificationsPublisher.publishNotification.mockRejectedValue(
      new Error('bus down'),
    );

    await expect(
      service.finalizeExecution({
        completedAt: new Date('2026-08-14T08:00:00.000Z'),
        executionId: 'exec-4',
        finalStatus: WorkflowExecutionStatus.FAILED,
        result: failedRunResult(),
        workflowId: 'wf-1',
        workflowStatus: WorkflowStatus.FAILED,
      }),
    ).resolves.toMatchObject({ id: 'exec-4' });

    expect(logger.error).toHaveBeenCalled();
  });
});
