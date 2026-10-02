import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutableNode, ExecutableWorkflow } from '../../types';
import { buildActionExecutionInput } from '../../utils/action-input';
import { type NodeExecutor, WorkflowEngine } from '../engine';

vi.mock('@genfeedai/actions', () => ({
  GENFEED_ACTION_NODE_TYPE: 'genfeedAction',
  getActionDefinition: (actionId: string) => {
    if (actionId === 'open.contract') {
      return {
        id: actionId,
        inputSchema: { properties: {}, type: 'object' },
        outputSchema: { type: 'null' },
      };
    }
    if (actionId === 'contract.failure')
      return {
        id: actionId,
        inputSchema: {
          additionalProperties: false,
          properties: {
            failure: {
              type: 'object',
              additionalProperties: false,
              properties: {
                error: { type: 'string' },
                failedNodeId: { type: 'string' },
                nodeOutputs: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {},
                },
              },
              required: ['error', 'failedNodeId', 'nodeOutputs'],
            },
            prompt: { type: 'string' },
          },
          required: ['failure', 'prompt'],
          type: 'object',
        },
        outputSchema: {
          additionalProperties: false,
          properties: { article: { type: 'string' } },
          required: ['article'],
          type: 'object',
        },
      };
    return actionId === 'contract.test'
      ? {
          id: actionId,
          inputSchema: {
            additionalProperties: false,
            properties: {
              prompt: { minLength: 1, type: 'string' },
              source: { minLength: 1, type: 'string' },
            },
            required: ['prompt', 'source'],
            type: 'object',
          },
          outputSchema: {
            additionalProperties: false,
            properties: {
              article: { minLength: 1, type: 'string' },
            },
            required: ['article'],
            type: 'object',
          },
        }
      : undefined;
  },
}));

function makeNode(parameters: Record<string, unknown>): ExecutableNode {
  return {
    config: { actionId: 'contract.test', parameters },
    id: 'node-contract',
    inputs: [],
    label: 'Contract action',
    type: 'genfeedAction',
  };
}

function makeWorkflow(node: ExecutableNode): ExecutableWorkflow {
  return {
    edges: [],
    id: 'workflow-contract',
    lockedNodeIds: [],
    nodes: [node],
    organizationId: 'org-1',
    userId: 'user-1',
    versionId: 'workflow-version-3',
  };
}

describe('WorkflowEngine action contracts', () => {
  let engine: WorkflowEngine;

  beforeEach(() => {
    engine = new WorkflowEngine({
      maxConcurrency: 1,
      retryConfig: {
        backoffMultiplier: 1,
        baseDelayMs: 0,
        maxDelayMs: 0,
        maxRetries: 3,
      },
    });
  });

  it('fails action registration when the canonical contract is open', () => {
    expect(() =>
      engine.registerExecutor('open.contract', async () => null),
    ).toThrow('must set additionalProperties');
  });

  it('still rejects duplicate action executor registration', () => {
    engine.registerExecutor('contract.test', async () => ({
      article: 'Generated article',
    }));

    expect(() =>
      engine.registerExecutor('contract.test', async () => ({
        article: 'Other article',
      })),
    ).toThrow('Duplicate workflow node executor: contract.test');
  });

  it('validates normalized parameters, payload, config, and inputs before invocation', async () => {
    const executor: NodeExecutor = vi.fn(async (executionNode, inputs) => ({
      article: String(
        buildActionExecutionInput(executionNode.config, inputs).prompt,
      ),
    }));
    engine.registerExecutor('contract.test', executor);
    const node = makeNode({
      inputVariableKeys: ['source'],
      payload: { prompt: 'Payload prompt' },
      prompt: 'Config prompt',
    });
    const upstreamNode: ExecutableNode = {
      config: {},
      id: 'source-node',
      inputs: [],
      label: 'Source',
      type: 'workflowInput',
    };
    engine.registerExecutor('workflowInput', async () => 'Video transcript');
    const workflow = makeWorkflow(node);
    workflow.nodes.unshift(upstreamNode);
    workflow.edges.push({
      id: 'source-contract',
      source: 'source-node',
      target: 'node-contract',
      targetHandle: 'source',
    });

    const result = await engine.execute(workflow);

    expect(result.status).toBe('completed');
    expect(executor).toHaveBeenCalledTimes(1);
    expect(result.nodeResults.get('node-contract')?.output).toEqual({
      article: 'Config prompt',
    });
  });

  it('fails invalid input once with redacted provenance before invocation', async () => {
    const executor: NodeExecutor = vi.fn().mockResolvedValue({
      article: 'Generated article',
    });
    engine.registerExecutor('contract.test', executor);

    const result = await engine.execute(
      makeWorkflow(makeNode({ prompt: 'secret prompt' })),
    );

    expect(result.status).toBe('failed');
    expect(result.error).toContain('Action contract input validation failed');
    expect(result.error).toContain('action=contract.test');
    expect(result.error).toContain('workflow=workflow-contract');
    expect(result.error).toContain('version=workflow-version-3');
    expect(result.error).toContain('node=node-contract');
    expect(result.error).toContain('$.source');
    expect(result.error).not.toContain('secret prompt');
    expect(executor).not.toHaveBeenCalled();
  });

  it('fails invalid output once after executor invocation', async () => {
    const executor: NodeExecutor = vi.fn().mockResolvedValue(undefined);
    engine.registerExecutor('contract.test', executor);

    const node = makeNode({
      prompt: 'Turn this into an article',
      source: 'Video transcript',
    });
    const result = await engine.execute(makeWorkflow(node));

    expect(result.status).toBe('failed');
    expect(result.error).toContain('Action contract output validation failed');
    expect(result.error).toContain('action=contract.test');
    expect(result.error).toContain('node=node-contract');
    expect(result.error).toContain('$: must be object');
    expect(executor).toHaveBeenCalledTimes(1);
  });

  it('keeps native control-flow executors outside action contracts', async () => {
    const executor: NodeExecutor = vi.fn().mockResolvedValue(undefined);
    engine.registerExecutor('workflowInput', executor);

    const workflow = makeWorkflow({
      config: {},
      id: 'native-node',
      inputs: [],
      label: 'Workflow input',
      type: 'workflowInput',
    });
    const result = await engine.execute(workflow);

    expect(result.status).toBe('completed');
    expect(executor).toHaveBeenCalledTimes(1);
  });
});

describe('WorkflowEngine required failure contract activation', () => {
  it.each([false, true])(
    'validates real routed failure input before registered compensation (%s)',
    async (failed) => {
      const engine = new WorkflowEngine({ maxConcurrency: 1 });
      const compensation = vi.fn(async () => ({ article: 'Compensated' }));
      engine.registerExecutor('contract.test', async () => {
        if (failed) throw new Error('source failed');
        return { article: 'Generated' };
      });
      engine.registerExecutor('contract.failure', async (_node, inputs) => {
        expect(inputs.get('failure')).toEqual({
          error: 'source failed',
          failedNodeId: 'source',
          nodeOutputs: {},
        });
        return compensation();
      });
      const source = {
        ...makeNode({ prompt: 'raw', source: 'user' }),
        id: 'source',
      };
      const sink: ExecutableNode = {
        ...makeNode({ prompt: 'raw' }),
        id: 'sink',
        config: { actionId: 'contract.failure', parameters: { prompt: 'raw' } },
      };
      const graph: ExecutableWorkflow = {
        ...makeWorkflow(source),
        nodes: [source, sink],
        edges: [
          {
            id: 'data',
            source: 'source',
            target: 'sink',
            sourceHandle: 'article',
            targetHandle: 'prompt',
          },
          {
            id: 'failure',
            source: 'source',
            target: 'sink',
            sourceHandle: 'failure',
            targetHandle: 'failure',
          },
        ],
      };
      const result = await engine.execute(graph, { maxRetries: 0 });
      expect(result.status).toBe(failed ? 'failed' : 'completed');
      expect(compensation).toHaveBeenCalledTimes(failed ? 1 : 0);
      if (!failed)
        expect(result.nodeResults.get('sink')).toMatchObject({
          status: 'skipped',
          creditsUsed: 0,
        });
    },
  );
});
