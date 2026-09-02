import {
  buildHiddenSystemWorkflowMetadata,
  HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
  SYSTEM_WORKFLOW_METADATA_KEY,
  SYSTEM_WORKFLOW_PRINCIPAL_ID,
} from '@api/collections/workflows/system-workflow.contract';
import { buildWorkflowVersionDefinition } from '@api/collections/workflows/workflow-version-definition';
import { WORKFLOW_EXECUTOR } from '@api/collections/workflows/workflows.tokens';
import { createGenfeedActionNode } from '@genfeedai/actions';
import type { NodeExecutor } from '@genfeedai/workflows/engine';
import { describe, expect, it, vi } from 'vitest';
import {
  type SystemWorkflowGraphDefinition,
  SystemWorkflowRunnerService,
  WORKFLOW_FOR_EACH_ACTION_ID,
  WORKFLOW_FOR_EACH_TENANT_ACTION_ID,
  WORKFLOW_RUN_CHILD_ACTION_ID,
} from './system-workflow-runner.service';

const definition: SystemWorkflowGraphDefinition = {
  canonicalId: 'clip-hook-review',
  definition: {
    edges: [],
    nodes: [
      createGenfeedActionNode({
        actionId: 'youtube.resolve-source',
        id: 'review-hook',
      }),
    ],
  },
  description: 'Review one generated hook clip.',
  label: 'Clip Hook Review',
  resultNodeId: 'review-hook',
};

describe('SystemWorkflowRunnerService definitions', () => {
  const service = new SystemWorkflowRunnerService({} as never, {} as never);
  const mismatchedInput = {
    actionType: 'clip-hook-review',
    canonicalId: 'different-workflow',
    organizationId: 'org-1',
    source: 'clip-generation',
    userId: 'user-1',
  };

  it('rejects an unregistered completed workflow identity', async () => {
    await expect(service.runWorkflow(mismatchedInput)).rejects.toThrow(
      'Unknown system workflow: different-workflow',
    );
  });

  it('rejects an unregistered pausable workflow identity', async () => {
    await expect(service.startWorkflow(mismatchedInput)).rejects.toThrow(
      'Unknown system workflow: different-workflow',
    );
  });

  it('rejects a registered workflow whose result node is absent', () => {
    expect(() =>
      service.registerWorkflow({
        ...definition,
        canonicalId: 'missing-result',
        resultNodeId: 'missing',
      }),
    ).toThrow('result node missing does not exist');
  });

  it('passes the stable run-and-node idempotency key to action executors', async () => {
    const { executors, runner } = createRunner();
    const action = vi.fn().mockResolvedValue({ sourceId: 'source-1' });
    runner.registerAction('youtube.resolve-source', action);

    await executors.get('youtube.resolve-source')?.(
      {
        config: { actionId: 'youtube.resolve-source' },
        id: 'resolve-source',
        inputs: [],
        label: 'Resolve source',
        type: 'genfeedAction',
      },
      new Map(),
      executionContext(),
    );

    expect(action).toHaveBeenCalledWith(
      expect.objectContaining({
        provenance: expect.objectContaining({
          executionId: 'parent-execution',
          idempotencyKey: 'workflow:parent-execution:resolve-source',
          nodeId: 'resolve-source',
        }),
      }),
    );
  });

  it('fails closed at bootstrap when a registered graph action has no executor', () => {
    const { runner } = createRunner();
    runner.registerWorkflow(definition);

    expect(() => runner.onApplicationBootstrap()).toThrow(
      'System workflow action executors missing: clip-hook-review:youtube.resolve-source',
    );
  });

  it('fails closed when a static for-each child workflow is not registered', () => {
    const { runner } = createRunner();
    runner.onModuleInit();
    runner.registerWorkflow({
      canonicalId: 'parent-workflow',
      definition: {
        edges: [],
        nodes: [
          createGenfeedActionNode({
            actionId: WORKFLOW_FOR_EACH_ACTION_ID,
            id: 'fan-out',
            parameters: { childWorkflowId: 'missing-child' },
          }),
        ],
      },
      description: 'Parent',
      label: 'Parent',
      resultNodeId: 'fan-out',
    });

    expect(() => runner.onApplicationBootstrap()).toThrow(
      'System workflow child definitions missing: parent-workflow:fan-out:missing-child',
    );
  });

  it('fails closed when a static run-child workflow is not registered', () => {
    const { runner } = createRunner();
    runner.onModuleInit();
    runner.registerWorkflow({
      canonicalId: 'parent-workflow',
      definition: {
        edges: [],
        nodes: [
          createGenfeedActionNode({
            actionId: WORKFLOW_RUN_CHILD_ACTION_ID,
            id: 'run-child',
            parameters: { childWorkflowId: 'missing-child' },
          }),
        ],
      },
      description: 'Parent',
      label: 'Parent',
      resultNodeId: 'run-child',
    });

    expect(() => runner.onApplicationBootstrap()).toThrow(
      'System workflow child definitions missing: parent-workflow:run-child:missing-child',
    );
  });

  it('executes one global hidden mirror with the invoking tenant context', async () => {
    const immutableDefinition = buildWorkflowVersionDefinition(
      definition.definition,
    );
    const mirror = {
      currentVersion: {
        contentHash: immutableDefinition.contentHash,
        graph: immutableDefinition.graph,
        id: 'global-version',
        inputSchema: immutableDefinition.inputSchema,
        version: 1,
      },
      currentVersionId: 'global-version',
      id: 'global-workflow',
      isDeleted: false,
      label: definition.label,
      metadata: {
        sourceType: HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
        [SYSTEM_WORKFLOW_METADATA_KEY]: buildHiddenSystemWorkflowMetadata({
          canonicalId: definition.canonicalId,
        }),
      },
      organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
      userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
    };
    const transaction = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      workflow: {
        findFirst: vi.fn().mockResolvedValue(mirror),
        update: vi.fn().mockResolvedValue(mirror),
      },
    };
    const prisma = {
      $transaction: vi.fn((callback) => callback(transaction)),
    };
    const executeManualWorkflowDocument = vi.fn().mockResolvedValue({
      executionId: 'execution-1',
    });
    const adapter = {
      getRegisteredActionIds: vi.fn(),
      registerExecutor: vi.fn(),
    };
    const moduleRef = {
      get: (token: unknown) =>
        token === WORKFLOW_EXECUTOR
          ? { executeManualWorkflowDocument }
          : adapter,
    };
    const runner = new SystemWorkflowRunnerService(
      prisma as never,
      moduleRef as never,
    );
    runner.registerWorkflow(definition);

    await runner.startWorkflow({
      actionType: definition.canonicalId,
      canonicalId: definition.canonicalId,
      organizationId: 'tenant-org',
      source: 'test',
      userId: 'tenant-user',
    });

    expect(transaction.workflow.findFirst).toHaveBeenCalledWith({
      include: { currentVersion: true },
      where: {
        isDeleted: false,
        metadata: {
          equals: definition.canonicalId,
          path: [SYSTEM_WORKFLOW_METADATA_KEY, 'canonicalId'],
        },
        organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
        userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
      },
    });
    expect(transaction.workflow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          description: definition.description,
          label: definition.label,
          metadata: expect.objectContaining({
            sourceTemplateId: definition.canonicalId,
            sourceType: HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
          }),
        }),
        where: { id: 'global-workflow' },
      }),
    );
    expect(executeManualWorkflowDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'global-workflow',
        organizationId: 'tenant-org',
        userId: 'tenant-user',
      }),
      'tenant-user',
      'tenant-org',
      {},
      expect.objectContaining({
        canonicalId: definition.canonicalId,
        isSystemAction: true,
      }),
      expect.anything(),
    );
  });

  it('precreates and queues one immutable parent execution', async () => {
    const queueSystemWorkflow = vi.fn().mockResolvedValue('queued-parent');
    const createExecution = vi.fn().mockResolvedValue({
      id: 'parent-execution',
      status: 'PENDING',
    });
    const { runner } = createRunner(
      { queueSystemWorkflow },
      {},
      {},
      { createExecution },
    );
    runner.registerWorkflow(definition);
    const internals = runner as unknown as RunnerInternals;
    vi.spyOn(internals, 'resolveUserId').mockResolvedValue('tenant-user');
    vi.spyOn(internals, 'ensureHiddenSystemWorkflowMirror').mockResolvedValue({
      currentVersion: { id: 'global-version' },
      id: 'global-workflow',
      label: definition.label,
    });

    await expect(
      runner.enqueueWorkflow({
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        idempotencyKey: 'workspace-task:subtask-1',
        inputValues: { ingredientIds: ['ingredient-1'] },
        metadata: { batchExecution: { itemCount: 1 } },
        organizationId: 'tenant-org',
        source: 'batch',
        userId: 'tenant-user',
      }),
    ).resolves.toEqual({
      executionId: 'parent-execution',
      status: 'PENDING',
    });
    expect(createExecution).toHaveBeenCalledWith(
      'tenant-user',
      'tenant-org',
      expect.objectContaining({
        idempotencyKey: 'workspace-task:subtask-1',
        workflowId: 'global-workflow',
        workflowVersionId: 'global-version',
      }),
    );
    expect(queueSystemWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ canonicalId: definition.canonicalId }),
      'system-workflow-parent-execution',
      expect.objectContaining({
        priorExecution: expect.objectContaining({
          executionId: 'parent-execution',
          status: 'PENDING',
          workflowId: 'global-workflow',
        }),
      }),
    );
  });

  it('marks a precreated parent failed when queueing fails', async () => {
    const queueError = new Error('queue unavailable');
    const queueSystemWorkflow = vi.fn().mockRejectedValue(queueError);
    const createExecution = vi.fn().mockResolvedValue({
      id: 'parent-execution',
      status: 'PENDING',
    });
    const completeExecution = vi.fn().mockResolvedValue({
      id: 'parent-execution',
      status: 'FAILED',
    });
    const { runner } = createRunner(
      { queueSystemWorkflow },
      {},
      {},
      { completeExecution, createExecution },
    );
    runner.registerWorkflow(definition);
    const internals = runner as unknown as RunnerInternals;
    vi.spyOn(internals, 'resolveUserId').mockResolvedValue('tenant-user');
    vi.spyOn(internals, 'ensureHiddenSystemWorkflowMirror').mockResolvedValue({
      currentVersion: { id: 'global-version' },
      id: 'global-workflow',
      label: definition.label,
    });

    await expect(
      runner.enqueueWorkflow({
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        organizationId: 'tenant-org',
        source: 'batch',
        userId: 'tenant-user',
      }),
    ).rejects.toBe(queueError);
    expect(completeExecution).toHaveBeenCalledWith(
      'parent-execution',
      'queue unavailable',
    );
  });

  it('runs one registered child with mapped inputs and parent provenance', async () => {
    const { executors, runner } = createRunner();
    runner.onModuleInit();
    runner.registerWorkflow(definition);
    vi.spyOn(runner, 'runWorkflow').mockResolvedValue({
      provenance: {
        executionId: 'child-execution',
        workflowId: 'child-workflow',
        workflowLabel: 'Child workflow',
      },
      result: { sourceId: 'source-1' },
    });

    const result = await executors.get(WORKFLOW_RUN_CHILD_ACTION_ID)?.(
      {
        config: { childWorkflowId: definition.canonicalId },
        id: 'run-child',
        inputs: ['request'],
        label: 'Run child',
        type: 'genfeedAction',
      },
      new Map([['request', { sourceId: 'source-1' }]]),
      executionContext(),
    );

    expect(result).toEqual({ sourceId: 'source-1' });
    expect(runner.runWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: definition.canonicalId,
        inputValues: { request: { sourceId: 'source-1' } },
        metadata: {
          parentExecutionId: 'parent-execution',
          parentNodeId: 'run-child',
          parentWorkflowId: 'parent-workflow',
        },
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    );
  });

  it('awaits one registered child workflow per item with bounded concurrency', async () => {
    const { executors, runner } = createRunner();
    runner.onModuleInit();
    runner.registerWorkflow(definition);
    vi.spyOn(runner, 'runWorkflow').mockImplementation(async (input) => ({
      provenance: {
        executionId: `execution-${String(input.inputValues?.item)}`,
        nodeId: 'result',
        workflowId: 'child-workflow',
        workflowLabel: 'Child workflow',
      },
      result: input.inputValues?.item,
    }));

    const result = await executors.get(WORKFLOW_FOR_EACH_ACTION_ID)?.(
      executableForEachNode({
        childWorkflowId: definition.canonicalId,
        itemInputKey: 'item',
        maxConcurrency: 2,
      }),
      new Map([['items', ['a', 'b']]]),
      executionContext(),
    );

    expect(result).toMatchObject({
      count: 2,
      results: [
        { index: 0, result: 'a' },
        { index: 1, result: 'b' },
      ],
    });
    expect(runner.runWorkflow).toHaveBeenCalledTimes(2);
  });

  it('executes the exact tenant workflow version for every pinned child', async () => {
    const executePinnedManualWorkflow = vi.fn().mockResolvedValue({
      execution: {
        executionId: 'child-execution',
        nodeResults: [],
        status: 'COMPLETED',
        workflowId: 'tenant-workflow',
      },
      workflowLabel: 'Tenant workflow',
    });
    const { executors, runner } = createRunner(
      undefined,
      {},
      { executePinnedManualWorkflow },
    );
    runner.onModuleInit();

    const forEachNode = executableForEachNode({
      childWorkflowId: 'tenant-workflow',
      childWorkflowVersionId: 'tenant-version',
    });
    const inputs = new Map([['items', ['ingredient-1']]]);
    const result = await executors.get(WORKFLOW_FOR_EACH_ACTION_ID)?.(
      forEachNode,
      inputs,
      executionContext(),
    );
    await executors.get(WORKFLOW_FOR_EACH_ACTION_ID)?.(
      forEachNode,
      inputs,
      executionContext(),
    );

    expect(executePinnedManualWorkflow).toHaveBeenCalledWith(
      'tenant-workflow',
      'tenant-version',
      'user-1',
      'org-1',
      { item: 'ingredient-1' },
      expect.objectContaining({
        childWorkflowVersionId: 'tenant-version',
        parentExecutionId: 'parent-execution',
        workflowForEachIndex: 0,
      }),
      expect.stringMatching(/^workflow-for-each:[a-f0-9]{64}$/),
    );
    expect(result).toMatchObject({
      count: 1,
      results: [
        {
          index: 0,
          provenance: {
            executionId: 'child-execution',
            workflowId: 'tenant-workflow',
          },
        },
      ],
    });
    expect(executePinnedManualWorkflow).toHaveBeenCalledTimes(2);
    expect(executePinnedManualWorkflow.mock.calls[0]?.[6]).toBe(
      executePinnedManualWorkflow.mock.calls[1]?.[6],
    );
  });

  it('collects a failed pinned child without hiding its execution identity', async () => {
    const executePinnedManualWorkflow = vi.fn().mockResolvedValue({
      execution: {
        error: 'Generation failed',
        executionId: 'failed-child-execution',
        nodeResults: [],
        status: 'FAILED',
        workflowId: 'tenant-workflow',
      },
      workflowLabel: 'Tenant workflow',
    });
    const { executors, runner } = createRunner(
      undefined,
      {},
      { executePinnedManualWorkflow },
    );
    runner.onModuleInit();

    const result = await executors.get(WORKFLOW_FOR_EACH_ACTION_ID)?.(
      executableForEachNode({
        childWorkflowId: 'tenant-workflow',
        childWorkflowVersionId: 'tenant-version',
        failureMode: 'collect',
      }),
      new Map([['items', ['ingredient-1']]]),
      executionContext(),
    );

    expect(result).toEqual({
      count: 1,
      results: [
        {
          error: 'Generation failed',
          executionId: 'failed-child-execution',
          index: 0,
          status: 'failed',
        },
      ],
    });
  });

  it('durably schedules paced children with deterministic delays', async () => {
    const queueSystemWorkflow = vi
      .fn()
      .mockImplementation(async (_input, jobId) => jobId);
    const { executors, runner } = createRunner({
      queueSystemWorkflow,
    });
    runner.onModuleInit();
    runner.registerWorkflow(definition);

    const result = await executors.get(WORKFLOW_FOR_EACH_ACTION_ID)?.(
      executableForEachNode({
        childWorkflowId: definition.canonicalId,
        initialDelayMs: 500,
        interItemDelayMs: 1_000,
        itemInputKey: 'item',
        mode: 'scheduled',
      }),
      new Map([['items', ['a', 'b']]]),
      executionContext(),
    );

    expect(result).toMatchObject({ count: 2 });
    expect(queueSystemWorkflow).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ inputValues: { item: 'a' } }),
      expect.stringMatching(/^workflow\.for-each-/),
      expect.objectContaining({ delayMs: 500 }),
    );
    expect(queueSystemWorkflow).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ inputValues: { item: 'b' } }),
      expect.stringMatching(/^workflow\.for-each-/),
      expect.objectContaining({ delayMs: 1_500 }),
    );
  });

  it('projects hidden system workflow children into validated tenant ownership', async () => {
    const prisma = {
      organization: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'org-2', userId: 'owner-2' },
          { id: 'org-3', userId: 'owner-3' },
        ]),
      },
      workflow: {
        findFirst: vi.fn().mockResolvedValue({
          metadata: {
            sourceType: HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
            [SYSTEM_WORKFLOW_METADATA_KEY]: buildHiddenSystemWorkflowMetadata({
              canonicalId: 'parent-workflow',
            }),
          },
        }),
      },
    };
    const { executors, runner } = createRunner(undefined, prisma);
    runner.onModuleInit();
    runner.registerWorkflow(definition);
    vi.spyOn(runner, 'runWorkflow').mockResolvedValue({
      provenance: {
        executionId: 'child-execution',
        nodeId: 'result',
        workflowId: 'child-workflow',
        workflowLabel: 'Child workflow',
      },
      result: null,
    });

    await executors.get(WORKFLOW_FOR_EACH_TENANT_ACTION_ID)?.(
      executableForEachNode(
        { childWorkflowId: definition.canonicalId, itemInputKey: 'item' },
        WORKFLOW_FOR_EACH_TENANT_ACTION_ID,
      ),
      new Map([
        ['items', [{ organizationId: 'org-2' }, { organizationId: 'org-3' }]],
      ]),
      executionContext(),
    );

    expect(prisma.workflow.findFirst).toHaveBeenCalledWith({
      select: { metadata: true },
      where: {
        id: 'parent-workflow',
        isDeleted: false,
        organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
        userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
      },
    });

    expect(runner.runWorkflow).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ organizationId: 'org-2', userId: 'owner-2' }),
    );
    expect(runner.runWorkflow).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ organizationId: 'org-3', userId: 'owner-3' }),
    );
  });

  it('rejects tenant projection from a non-system workflow', async () => {
    const prisma = {
      organization: { findMany: vi.fn() },
      workflow: {
        findFirst: vi.fn().mockResolvedValue({
          metadata: { sourceType: 'user-workflow' },
        }),
      },
    };
    const { executors, runner } = createRunner(undefined, prisma);
    runner.onModuleInit();

    await expect(
      executors.get(WORKFLOW_FOR_EACH_TENANT_ACTION_ID)?.(
        executableForEachNode(
          { childWorkflowId: definition.canonicalId },
          WORKFLOW_FOR_EACH_TENANT_ACTION_ID,
        ),
        new Map([['items', [{ organizationId: 'org-2' }]]]),
        executionContext(),
      ),
    ).rejects.toThrow(
      'workflow.for-each-tenant requires a hidden system workflow parent',
    );
  });
});

function createRunner(
  queue = { queueSystemWorkflow: vi.fn() },
  prisma: object = {},
  workflowExecutor: object = {},
  workflowExecutions: object = {},
): {
  executors: Map<string, NodeExecutor>;
  runner: SystemWorkflowRunnerService;
} {
  const executors = new Map<string, NodeExecutor>();
  const adapter = {
    getRegisteredActionIds: () => [...executors.keys()],
    registerExecutor: (actionId: string, executor: NodeExecutor) => {
      executors.set(actionId, executor);
    },
  };
  const moduleRef = {
    get: (token: unknown) => {
      const name = (token as { name?: string })?.name;
      if (name === 'WorkflowExecutionQueueService') {
        return queue;
      }
      if (token === WORKFLOW_EXECUTOR) {
        return workflowExecutor;
      }
      if (name === 'WorkflowExecutionsService') {
        return workflowExecutions;
      }
      return adapter;
    },
  };
  return {
    executors,
    runner: new SystemWorkflowRunnerService(
      prisma as never,
      moduleRef as never,
    ),
  };
}

type RunnerInternals = {
  ensureHiddenSystemWorkflowMirror: (
    definition: SystemWorkflowGraphDefinition,
  ) => Promise<{
    currentVersion: { id: string };
    id: string;
    label: string;
  }>;
  resolveUserId: (organizationId: string, userId?: string) => Promise<string>;
};

function executableForEachNode(
  config: Record<string, unknown>,
  type = WORKFLOW_FOR_EACH_ACTION_ID,
): Parameters<NodeExecutor>[0] {
  return {
    config,
    id: 'for-each',
    inputs: ['items'],
    label: 'For each item',
    type,
  };
}

function executionContext(): Parameters<NodeExecutor>[2] {
  return {
    executionId: 'parent-execution',
    organizationId: 'org-1',
    runId: 'parent-run',
    userId: 'user-1',
    workflowId: 'parent-workflow',
    workflowVersionId: 'parent-version',
  };
}
