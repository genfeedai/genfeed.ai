import type { NodeExecutor } from '@genfeedai/workflows/engine';
import { describe, expect, it, vi } from 'vitest';
import {
  type SystemWorkflowGraphDefinition,
  SystemWorkflowRunnerService,
  WORKFLOW_FOR_EACH_ACTION_ID,
} from './system-workflow-runner.service';

const definition: SystemWorkflowGraphDefinition = {
  canonicalId: 'clip-hook-review',
  definition: { edges: [], nodes: [] },
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

  it('rejects a mismatched completed workflow identity', async () => {
    await expect(
      service.runWorkflowDefinition(definition, mismatchedInput),
    ).rejects.toThrow(
      'System workflow definition clip-hook-review cannot execute as different-workflow',
    );
  });

  it('rejects a mismatched pausable workflow identity', async () => {
    await expect(
      service.startWorkflowDefinition(definition, mismatchedInput),
    ).rejects.toThrow(
      'System workflow definition clip-hook-review cannot execute as different-workflow',
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
    const queueSystemWorkflowDefinition = vi
      .fn()
      .mockImplementation(async (_definition, _input, jobId) => jobId);
    const { executors, runner } = createRunner({
      queueSystemWorkflowDefinition,
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
    expect(queueSystemWorkflowDefinition).toHaveBeenNthCalledWith(
      1,
      definition,
      expect.objectContaining({ inputValues: { item: 'a' } }),
      expect.stringMatching(/^workflow\.for-each-/),
      undefined,
      expect.objectContaining({ delayMs: 500 }),
    );
    expect(queueSystemWorkflowDefinition).toHaveBeenNthCalledWith(
      2,
      definition,
      expect.objectContaining({ inputValues: { item: 'b' } }),
      expect.stringMatching(/^workflow\.for-each-/),
      undefined,
      expect.objectContaining({ delayMs: 1_500 }),
    );
  });
});

function createRunner(queue = { queueSystemWorkflowDefinition: vi.fn() }): {
  executors: Map<string, NodeExecutor>;
  runner: SystemWorkflowRunnerService;
} {
  const executors = new Map<string, NodeExecutor>();
  const adapter = {
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
    runner: new SystemWorkflowRunnerService({} as never, moduleRef as never),
  };
}

function executableForEachNode(
  config: Record<string, unknown>,
): Parameters<NodeExecutor>[0] {
  return {
    config,
    id: 'for-each',
    inputs: ['items'],
    label: 'For each item',
    type: WORKFLOW_FOR_EACH_ACTION_ID,
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
