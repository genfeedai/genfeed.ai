import { sumPersistedNodeCredits } from '@api/collections/workflow-executions/services/workflow-node-credits';
import { WorkflowExecutionGraphService } from '@api/collections/workflows/services/workflow-execution-graph.service';
import { WorkflowExecutionRunnerService } from '@api/collections/workflows/services/workflow-execution-runner.service';
import type { DelayResumeJobData } from '@api/collections/workflows/services/workflow-executor.types';
import { WorkflowExecutionStatus, WorkflowStatus } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock(
  '@api/collections/workflow-executions/services/workflow-node-credits',
  () => ({
    sumPersistedNodeCredits: vi.fn(),
  }),
);

describe('WorkflowExecutionRunnerService.resumeAfterDelay — never strands a running execution (#4307)', () => {
  const prisma = {
    member: { findFirst: vi.fn() },
    workflow: { update: vi.fn() },
  };
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
    settleClipChainReservationForWorkflow: vi.fn(),
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
    prisma.member.findFirst.mockResolvedValue({ id: 'member-1' });
    executionsService.findOne.mockResolvedValue({
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      userId: 'user-1',
      workflowVersionId: 'version-1',
    });
    executionsService.getRuntimeState.mockResolvedValue({
      metadata: undefined,
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    executionsService.completeExecution.mockResolvedValue({
      metadata: undefined,
    });
    vi.mocked(sumPersistedNodeCredits).mockResolvedValue(12);
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

  it('uses the recorded delay actor for hydration, graph context, event and failure settlement', async () => {
    const actor = ' recorded-delay-actor ';
    executionsService.findOne.mockResolvedValue({
      userId: actor,
      workflowVersionId: 'version-1',
    });
    const doc = { brandId: null, userId: 'creator' };
    documentService.findPinnedWorkflow.mockResolvedValue(doc);
    engineAdapter.convertToExecutableWorkflow.mockImplementation(
      (workflow) => ({ nodes: [], edges: [], userId: workflow.userId }),
    );
    graphRunner.executeNodeGraph.mockRejectedValue(
      new Error('provider failed'),
    );
    const queued = {
      ...jobData,
      userId: 'queue-actor',
      triggerEvent: { ...jobData.triggerEvent, userId: 'queue-event-actor' },
    };
    await runner.resumeAfterDelay(queued);
    expect(documentService.findPinnedWorkflow).toHaveBeenCalledWith(
      'workflow-1',
      'version-1',
      'org-1',
      actor,
    );
    expect(graphRunner.executeNodeGraph).toHaveBeenCalledWith(
      expect.objectContaining({ userId: actor }),
      expect.objectContaining({ userId: actor }),
      'execution-1',
      expect.anything(),
    );
    expect(
      finalizer.settleClipChainReservationForWorkflow,
    ).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: actor }));
    expect(queued.triggerEvent.userId).toBe('queue-event-actor');
    expect(doc.userId).toBe('creator');
  });

  it.each([undefined, null, 42, {}, '', '  \t'])(
    'blocks delay with invalid recorded actor %j before hydration or settlement',
    async (actor) => {
      executionsService.findOne.mockResolvedValue({
        userId: actor,
        workflowVersionId: 'version-1',
      });
      await expect(runner.resumeAfterDelay(jobData)).rejects.toThrow(
        'execution-1',
      );
      expect(documentService.findPinnedWorkflow).not.toHaveBeenCalled();
      expect(graphRunner.executeNodeGraph).not.toHaveBeenCalled();
      expect(
        finalizer.settleClipChainReservationForWorkflow,
      ).not.toHaveBeenCalled();
      expect(progressService.publishWorkflowTaskUpdate).not.toHaveBeenCalled();
    },
  );

  it('fails a delayed resume without running nodes when the recorded actor was removed from the organization (#5892)', async () => {
    prisma.member.findFirst.mockResolvedValue(null);

    const result = await runner.resumeAfterDelay(jobData);

    expect(prisma.member.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        isActive: true,
        isDeleted: false,
        organizationId: 'org-1',
        userId: 'user-1',
      },
    });
    expect(result.status).toBe(WorkflowExecutionStatus.FAILED);
    expect(result.error).toContain('no longer an active member');
    expect(executionsService.completeExecution).toHaveBeenCalledWith(
      'execution-1',
      'org-1',
      expect.stringContaining('no longer an active member'),
    );
    expect(documentService.findPinnedWorkflow).not.toHaveBeenCalled();
    expect(graphRunner.executeNodeGraph).not.toHaveBeenCalled();
  });

  it('blocks a missing delayed execution before hydration without a queued actor fallback', async () => {
    executionsService.findOne.mockResolvedValue(null);
    await expect(runner.resumeAfterDelay(jobData)).rejects.toThrow(
      'execution-1',
    );
    expect(documentService.findPinnedWorkflow).not.toHaveBeenCalled();
    expect(
      finalizer.settleClipChainReservationForWorkflow,
    ).not.toHaveBeenCalled();
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
      'org-1',
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
    expect(sumPersistedNodeCredits).toHaveBeenCalledWith(
      prisma,
      'execution-1',
      'org-1',
    );
    expect(
      finalizer.settleClipChainReservationForWorkflow,
    ).toHaveBeenCalledWith({
      actorUserId: 'user-1',
      organizationId: 'org-1',
      totalCreditsUsed: 12,
      workflowId: 'workflow-1',
    });
    expect(result.totalCreditsUsed).toBe(12);
  });

  it('settles completed clip-chain credits when a delayed pinned workflow is gone', async () => {
    documentService.findPinnedWorkflow.mockResolvedValue(null);

    const result = await runner.resumeAfterDelay(jobData);

    expect(result.status).toBe(WorkflowExecutionStatus.FAILED);
    expect(
      finalizer.settleClipChainReservationForWorkflow,
    ).toHaveBeenCalledWith({
      actorUserId: 'user-1',
      organizationId: 'org-1',
      totalCreditsUsed: 12,
      workflowId: 'workflow-1',
    });
    expect(result.totalCreditsUsed).toBe(12);
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
