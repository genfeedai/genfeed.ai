import { WorkflowExecutionGraphService } from '@api/collections/workflows/services/workflow-execution-graph.service';
import { WorkflowExecutionRunnerService } from '@api/collections/workflows/services/workflow-execution-runner.service';
import type { DelayResumeJobData } from '@api/collections/workflows/services/workflow-executor.types';
import { WorkflowExecutionStatus, WorkflowStatus } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('WorkflowExecutionRunnerService.resumeAfterDelay — never strands a running execution (#4307)', () => {
  const prisma = { workflow: { update: vi.fn() } };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const engineAdapter = {
    applyRuntimeInputValues: vi.fn(),
    convertToExecutableWorkflow: vi.fn(),
  };
  const executionsService = {
    completeExecution: vi.fn(),
    findOne: vi.fn(),
    getRuntimeState: vi.fn(),
  };
  const documentService = {
    findPinnedWorkflow: vi.fn(),
    getWorkflowLabel: vi.fn(),
  };
  const progressService = {
    clearEtaPlan: vi.fn(),
    emitEvent: vi.fn(),
    extractEstimatedDurationMs: vi.fn(),
    extractEtaFromMetadata: vi.fn(),
    publishWorkflowStatus: vi.fn(),
    publishWorkflowTaskUpdate: vi.fn(),
  };
  const finalizer = {
    finalizeExecution: vi.fn(),
    mapRunResultToExecutionStatus: vi.fn(),
  };
  const graphRunner = { executeNodeGraph: vi.fn() };

  let runner: WorkflowExecutionRunnerService;

  const jobData: DelayResumeJobData = {
    delayNodeId: 'delay-1',
    executionId: 'execution-1',
    nodeOutputCache: {},
    organizationId: 'org-1',
    remainingNodeIds: ['publish'],
    triggerEvent: {
      data: {},
      organizationId: 'org-1',
      platform: 'internal',
      type: 'manual',
      userId: 'user-1',
    },
    userId: 'user-1',
    workflowId: 'workflow-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    executionsService.findOne.mockResolvedValue({
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      workflowVersionId: 'version-1',
    });
    executionsService.getRuntimeState.mockResolvedValue({
      metadata: undefined,
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    executionsService.completeExecution.mockResolvedValue({
      metadata: undefined,
    });
    documentService.findPinnedWorkflow.mockResolvedValue({ brandId: null });
    documentService.getWorkflowLabel.mockReturnValue('Test workflow');
    engineAdapter.convertToExecutableWorkflow.mockReturnValue({
      edges: [],
      emitSharedEvents: true,
      id: 'workflow-1',
      lockedNodeIds: [],
      nodes: [],
      organizationId: 'org-1',
      userId: 'user-1',
      versionId: 'version-1',
    });
    engineAdapter.applyRuntimeInputValues.mockImplementation(
      (_doc: unknown, executableWorkflow: unknown) => executableWorkflow,
    );
    progressService.extractEstimatedDurationMs.mockReturnValue(undefined);
    progressService.extractEtaFromMetadata.mockReturnValue(undefined);
    progressService.clearEtaPlan.mockReturnValue(undefined);
    progressService.publishWorkflowStatus.mockResolvedValue(undefined);
    finalizer.finalizeExecution.mockResolvedValue({
      completedAt: new Date(),
      error: null,
      executionId: 'execution-1',
      nodeResults: [],
      startedAt: new Date(),
      status: WorkflowExecutionStatus.COMPLETED,
      totalCreditsUsed: 3,
      workflowId: 'workflow-1',
    });

    runner = new WorkflowExecutionRunnerService(
      prisma as never,
      logger as never,
      engineAdapter as never,
      executionsService as never,
      documentService as never,
      new WorkflowExecutionGraphService(),
      progressService as never,
      finalizer as never,
      graphRunner as never,
      undefined,
    );
  });

  it('marks the execution and workflow failed instead of leaving it running when the resumed graph pass throws', async () => {
    graphRunner.executeNodeGraph.mockRejectedValue(
      new Error('lease lost mid-resume'),
    );

    const result = await runner.resumeAfterDelay(jobData);

    expect(result.status).toBe(WorkflowExecutionStatus.FAILED);
    expect(result.error).toBe('lease lost mid-resume');
    expect(executionsService.completeExecution).toHaveBeenCalledWith(
      'execution-1',
      'lease lost mid-resume',
    );
    expect(prisma.workflow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: WorkflowStatus.FAILED },
      }),
    );
    expect(progressService.publishWorkflowTaskUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ executionId: 'execution-1', status: 'failed' }),
    );
  });

  it('still returns the finalized result when the resumed graph pass succeeds', async () => {
    graphRunner.executeNodeGraph.mockResolvedValue({
      completedAt: new Date(),
      nodeResults: new Map(),
      runId: 'execution-1',
      startedAt: new Date(),
      status: 'completed',
      totalCreditsUsed: 3,
      workflowId: 'workflow-1',
    });
    finalizer.mapRunResultToExecutionStatus.mockReturnValue(
      WorkflowExecutionStatus.COMPLETED,
    );

    const result = await runner.resumeAfterDelay(jobData);

    expect(result.status).toBe(WorkflowExecutionStatus.COMPLETED);
    expect(prisma.workflow.update).not.toHaveBeenCalled();
  });
});
