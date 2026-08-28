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
          metadata: { sourceType: 'hidden-system-workflow' },
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
    get: (token: { name?: string }) =>
      token.name === 'WorkflowExecutionQueueService' ? queue : adapter,
  };
  return {
    executors,
    runner: new SystemWorkflowRunnerService(
      prisma as never,
      moduleRef as never,
    ),
  };
}

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
