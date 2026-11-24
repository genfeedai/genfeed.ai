import { sumPersistedNodeCredits } from '@api/collections/workflow-executions/services/workflow-node-credits';
import { WorkflowEngineConverterService } from '@api/collections/workflows/services/workflow-engine-converter.service';
import { WorkflowExecutionGraphService } from '@api/collections/workflows/services/workflow-execution-graph.service';
import { WorkflowExecutionRunnerService } from '@api/collections/workflows/services/workflow-execution-runner.service';
import type {
  DelayResumeJobData,
  TriggerEvent,
} from '@api/collections/workflows/services/workflow-executor.types';
import { WorkflowMissingInputException } from '@api/helpers/exceptions/workflow-missing-input/workflow-missing-input.exception';
import {
  WorkflowExecutionStatus,
  WorkflowExecutionTrigger,
} from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock(
  '@api/collections/workflow-executions/services/workflow-node-credits',
  () => ({ sumPersistedNodeCredits: vi.fn().mockResolvedValue(0) }),
);
vi.mock(
  '@api/collections/workflow-executions/services/workflow-cost-estimate',
  () => ({ captureWorkflowCostEstimate: vi.fn().mockResolvedValue(undefined) }),
);

/**
 * A selected-node run (`POST /workflows/:id/execute` with `selectedNodeIds`)
 * of a workflow whose generation branch needs two required inputs. The graph
 * runner is the provider-dispatch boundary: when it never runs, no generation
 * was started or billed.
 */
describe('WorkflowExecutionRunnerService required input check (#11075)', () => {
  const converter = new WorkflowEngineConverterService();
  const prisma = { workflow: { update: vi.fn() } };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const engineAdapter = {
    applyRuntimeInputValues: (
      ...args: Parameters<typeof converter.applyRuntimeInputValues>
    ) => converter.applyRuntimeInputValues(...args),
    convertToExecutableWorkflow: (
      ...args: Parameters<typeof converter.convertToExecutableWorkflow>
    ) => converter.convertToExecutableWorkflow(...args),
  };
  // What the run leaves behind: the executions it created and the node
  // graphs it dispatched. `graphRunner` is the provider-dispatch boundary.
  const createdExecutions: string[] = [];
  const dispatchedGraphs: string[][] = [];
  const executionsService = {
    captureMissingCostEstimate: vi.fn(),
    completeExecution: vi.fn(),
    createExecution: async () => {
      createdExecutions.push('execution-1');
      return { id: 'execution-1' };
    },
    startExecution: async () => true,
  };
  const documentService = { getWorkflowLabel: vi.fn() };
  const progressService = {
    clearEtaPlan: vi.fn(),
    emitEvent: vi.fn(),
    extractEtaFromMetadata: vi.fn(),
    publishWorkflowTaskUpdate: vi.fn(),
    rememberEtaPlan: vi.fn(),
  };
  const finalizer = {
    finalizeExecution: vi.fn(),
    mapRunResultToExecutionStatus: vi.fn(),
  };
  const graphRunner = {
    executeNodeGraph: async (
      _workflow: unknown,
      _event: unknown,
      _executionId: string,
      options: { selectedNodeIds?: string[] },
    ) => {
      dispatchedGraphs.push(options.selectedNodeIds ?? []);
      return {
        completedAt: new Date(),
        nodeResults: new Map(),
        runId: 'execution-1',
        startedAt: new Date(),
        status: 'completed',
        totalCreditsUsed: 0,
        workflowId: 'workflow-1',
      };
    },
  };

  const workflowDoc = {
    brandId: null,
    edges: [
      { id: 'e1', source: 'angle-input', target: 'generate' },
      { id: 'e2', source: 'style-input', target: 'generate' },
    ],
    id: 'workflow-1',
    inputVariables: [
      {
        key: 'visualAngle',
        label: 'Visual angle',
        required: true,
        type: 'text',
      },
      {
        key: 'visualStyle',
        label: 'Visual style',
        required: true,
        type: 'text',
      },
    ],
    lockedNodeIds: [],
    nodes: [
      {
        data: { config: { inputName: 'visualAngle' }, label: 'Angle' },
        id: 'angle-input',
        position: { x: 0, y: 0 },
        type: 'workflowInput',
      },
      {
        data: { config: { inputName: 'visualStyle' }, label: 'Style' },
        id: 'style-input',
        position: { x: 0, y: 80 },
        type: 'workflowInput',
      },
      {
        data: {
          config: { actionId: 'imageGen', parameters: {} },
          label: 'Generate',
        },
        id: 'generate',
        position: { x: 200, y: 0 },
        type: 'genfeedAction',
      },
      {
        data: { config: {}, label: 'Library Video' },
        id: 'library-video',
        position: { x: 0, y: 200 },
        type: 'input-video',
      },
    ],
    organizationId: 'org-1',
    userId: 'user-1',
    versionId: 'version-1',
  };
  const eventWith = (data: Record<string, unknown>): TriggerEvent => ({
    data,
    organizationId: 'org-1',
    platform: 'manual',
    type: 'partial',
    userId: 'user-1',
  });

  let runner: WorkflowExecutionRunnerService;

  const runSelected = (
    selectedNodeIds: string[],
    data: Record<string, unknown>,
  ) =>
    runner.executeWorkflowDocument(
      workflowDoc as never,
      eventWith(data),
      WorkflowExecutionTrigger.MANUAL,
      { executionMode: 'partial', selectedNodeIds },
      undefined,
      { respectLocks: true, selectedNodeIds },
    );

  beforeEach(() => {
    vi.clearAllMocks();
    createdExecutions.length = 0;
    dispatchedGraphs.length = 0;
    documentService.getWorkflowLabel.mockReturnValue('Review workflow');
    finalizer.finalizeExecution.mockResolvedValue({ metadata: undefined });
    finalizer.mapRunResultToExecutionStatus.mockReturnValue(
      WorkflowExecutionStatus.COMPLETED,
    );
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

  it('runs a selected node that reads no required input without asking for the generation inputs', async () => {
    const result = await runSelected(['library-video'], {});

    expect(result.status).toBe(WorkflowExecutionStatus.COMPLETED);
    expect(dispatchedGraphs).toEqual([['library-video']]);
  });

  it('stops before the run exists when a selected node needs required inputs that are missing', async () => {
    const failure = await runSelected(['generate'], {}).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(WorkflowMissingInputException);
    expect(
      (failure as WorkflowMissingInputException).missingInputs.map(
        (input) => input.name,
      ),
    ).toEqual(['visualAngle', 'visualStyle']);
    expect(createdExecutions).toEqual([]);
    expect(dispatchedGraphs).toEqual([]);
  });

  it('dispatches the selected node once the missing inputs are supplied', async () => {
    const result = await runSelected(['generate'], {
      visualAngle: 'low angle',
      visualStyle: 'Cinematic',
    });

    expect(result.status).toBe(WorkflowExecutionStatus.COMPLETED);
    expect(createdExecutions).toEqual(['execution-1']);
    expect(dispatchedGraphs).toEqual([['generate']]);
  });

  describe('resuming a delayed run', () => {
    const resumeJob = (): DelayResumeJobData => ({
      delayNodeId: 'delay-1',
      executionId: 'execution-1',
      nodeOutputCache: {},
      organizationId: 'org-1',
      remainingNodeIds: ['library-video'],
      triggerEvent: eventWith({}),
      userId: 'user-1',
      workflowId: 'workflow-1',
    });
    // The recorded execution, as the partial run left it.
    const recordExecution = (metadata: Record<string, unknown>) => {
      const recorded = {
        metadata,
        startedAt: new Date('2026-01-01T00:00:00.000Z'),
        userId: 'user-1',
        workflowVersionId: 'version-1',
      };
      const resumedExecutions = {
        ...executionsService,
        completeExecution: async () => ({ metadata: undefined }),
        findOne: async () => recorded,
        getRuntimeState: async () => recorded,
      };

      return new WorkflowExecutionRunnerService(
        {
          $transaction: async (work: (tx: unknown) => Promise<unknown>) =>
            work({}),
          member: { findFirst: async () => ({ id: 'member-1' }) },
          workflow: { update: async () => undefined },
          workflowExecution: { count: async () => 0 },
        } as never,
        logger as never,
        engineAdapter as never,
        resumedExecutions as never,
        {
          findPinnedWorkflow: async () => workflowDoc,
          getWorkflowLabel: () => 'Review workflow',
        } as never,
        new WorkflowExecutionGraphService(),
        {
          ...progressService,
          extractEstimatedDurationMs: () => undefined,
          publishWorkflowStatus: async () => undefined,
        } as never,
        finalizer as never,
        graphRunner as never,
        undefined,
      );
    };

    it('asks only for the inputs upstream of the nodes the partial run selected', async () => {
      vi.mocked(sumPersistedNodeCredits).mockResolvedValue(0);
      const resumed = recordExecution({
        executionMode: 'partial',
        selectedNodeIds: ['library-video'],
      });

      const result = await resumed.resumeAfterDelay(resumeJob());

      expect(result.status).toBe(WorkflowExecutionStatus.COMPLETED);
      expect(dispatchedGraphs).toHaveLength(1);
    });

    it('still asks for every required input when the run was a full one', async () => {
      const resumed = recordExecution({ executionMode: 'full' });

      const failure = await resumed
        .resumeAfterDelay(resumeJob())
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(WorkflowMissingInputException);
      expect(dispatchedGraphs).toEqual([]);
    });
  });
});
