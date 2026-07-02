import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loggerError: vi.fn(),
  propagateOutputsDownstream: vi.fn(),
  setShowDebugPanel: vi.fn(),
  updateNodeData: vi.fn(),
}));

vi.mock('../../uiStore', () => ({
  useUIStore: {
    getState: () => ({
      setShowDebugPanel: mocks.setShowDebugPanel,
    }),
  },
}));

vi.mock('../../workflow/workflowStore', () => ({
  useWorkflowStore: {
    getState: () => workflowStore,
  },
}));

import { NodeStatusEnum } from '@genfeedai/types';
import { configureWorkflowLogger } from '../../executionLogger';
import type { ExecutionStore } from '../types';
import {
  createExecutionSubscription,
  createNodeExecutionSubscription,
} from './sseSubscription';

const workflowStore = {
  getNodeById: vi.fn((nodeId: string) => ({
    data: { label: `Node ${nodeId}` },
    id: nodeId,
    type: 'imageGen',
  })),
  propagateOutputsDownstream: mocks.propagateOutputsDownstream,
  updateNodeData: mocks.updateNodeData,
};

class MockEventSource {
  static instances: MockEventSource[] = [];

  close = vi.fn();

  onerror: ((event: unknown) => void) | null = null;

  onmessage: ((event: { data: string }) => void) | null = null;

  constructor(public readonly url: string) {
    MockEventSource.instances.push(this);
  }

  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  emitRaw(data: string) {
    this.onmessage?.({ data });
  }

  error(event: unknown = new Error('sse failed')) {
    this.onerror?.(event);
  }
}

function createState(overrides: Partial<ExecutionStore> = {}) {
  let state: Partial<ExecutionStore> = {
    activeNodeExecutions: new Map(),
    debugPayloads: [],
    jobs: new Map(),
    ...overrides,
  };

  const set = vi.fn(
    (
      update:
        | Partial<ExecutionStore>
        | ((state: ExecutionStore) => Partial<ExecutionStore>),
    ) => {
      const patch =
        typeof update === 'function' ? update(state as ExecutionStore) : update;
      state = { ...state, ...patch };
    },
  );

  return {
    getState: () => state,
    set,
  };
}

async function flushAsyncHandlers() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('sse subscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The package resolves its execution logger via injection (the app fork
    // mocked its concrete logger module).
    configureWorkflowLogger({ error: mocks.loggerError });
    MockEventSource.instances = [];
    vi.stubGlobal('EventSource', MockEventSource);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          nodeResults: [
            {
              nodeId: 'node-1',
              output: { image: 'https://asset.test/final.png' },
              status: 'succeeded',
            },
          ],
        }),
        ok: true,
      }),
    );
  });

  afterEach(() => {
    configureWorkflowLogger(undefined);
    vi.unstubAllGlobals();
  });

  it('subscribes to execution streams and stores the EventSource', () => {
    const { set, getState } = createState();

    const source = createExecutionSubscription('execution-1', set as never);

    expect(source).toBe(MockEventSource.instances[0]);
    expect(MockEventSource.instances[0].url).toBe(
      'http://local.genfeed.ai:3010/api/executions/execution-1/stream',
    );
    expect(getState().eventSource).toBe(source);
  });

  it('updates node status, output, jobs, debug payloads, and completion state', async () => {
    const { set, getState } = createState();
    createExecutionSubscription('execution-1', set as never);

    MockEventSource.instances[0].emit({
      debugMode: true,
      jobs: [
        {
          nodeId: 'node-1',
          output: { image: 'https://asset.test/job.png' },
          predictionId: 'prediction-1',
          result: {
            debugPayload: {
              input: { prompt: 'launch' },
              model: 'model-1',
              timestamp: '2026-01-01T00:00:00.000Z',
            },
          },
          status: 'succeeded',
        },
      ],
      nodeResults: [
        {
          nodeId: 'node-1',
          output: { images: ['https://asset.test/1.png'] },
          status: 'complete',
        },
        {
          error: 'bad prompt',
          nodeId: 'node-2',
          status: 'error',
        },
      ],
      pendingNodes: [
        { dependsOn: [], nodeData: {}, nodeId: 'node-3', nodeType: 'llm' },
      ],
      status: 'running',
    });
    await flushAsyncHandlers();

    expect(mocks.updateNodeData).toHaveBeenCalledWith('node-1', {
      error: undefined,
      outputImage: 'https://asset.test/1.png',
      outputImages: ['https://asset.test/1.png'],
      status: NodeStatusEnum.COMPLETE,
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('node-2', {
      error: 'bad prompt',
      status: NodeStatusEnum.ERROR,
    });
    expect(mocks.propagateOutputsDownstream).toHaveBeenCalledWith('node-1');
    expect(mocks.setShowDebugPanel).toHaveBeenCalledWith(true);
    expect(getState().lastFailedNodeId).toBe('node-2');
    expect(getState().debugPayloads).toEqual([
      {
        input: { prompt: 'launch' },
        model: 'model-1',
        nodeId: 'node-1',
        nodeName: 'Node node-1',
        nodeType: 'imageGen',
        timestamp: '2026-01-01T00:00:00.000Z',
      },
    ]);
    expect(getState().jobs?.get('prediction-1')).toMatchObject({
      nodeId: 'node-1',
      output: { image: 'https://asset.test/job.png' },
      status: 'succeeded',
    });

    MockEventSource.instances[0].emit({
      nodeResults: [],
      pendingNodes: [],
      status: 'completed',
    });
    await flushAsyncHandlers();

    expect(MockEventSource.instances[0].close).toHaveBeenCalled();
    expect(getState()).toMatchObject({
      currentNodeId: null,
      eventSource: null,
      isRunning: false,
      jobs: new Map(),
    });
  });

  it('logs parse failures and reconciles on stream errors', async () => {
    const { getState, set } = createState({ isRunning: true });
    createExecutionSubscription('execution-1', set as never);

    MockEventSource.instances[0].emitRaw('{bad json');
    await flushAsyncHandlers();
    MockEventSource.instances[0].error();
    await flushAsyncHandlers();

    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to parse SSE message',
      {
        context: 'ExecutionStore',
        error: expect.any(SyntaxError),
      },
    );
    expect(mocks.loggerError).toHaveBeenCalledWith('SSE connection error', {
      context: 'ExecutionStore',
      error: expect.any(Error),
    });
    expect(MockEventSource.instances[0].close).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      'http://local.genfeed.ai:3010/api/executions/execution-1',
    );
    expect(mocks.updateNodeData).toHaveBeenCalledWith('node-1', {
      error: undefined,
      outputImage: 'https://asset.test/final.png',
      outputImages: ['https://asset.test/final.png'],
      status: NodeStatusEnum.COMPLETE,
    });
    expect(getState()).toMatchObject({
      eventSource: null,
      isRunning: false,
    });
  });

  it('handles node-scoped execution streams without mutating global execution state', async () => {
    const { getState, set } = createState({
      activeNodeExecutions: new Map([
        [
          'node-1',
          {
            eventSource: {} as EventSource,
            executionId: 'execution-1',
            nodeIds: ['node-1'],
          },
        ],
      ]),
    });

    createNodeExecutionSubscription(
      'execution-1',
      'node-1',
      set as never,
      vi.fn() as never,
    );
    MockEventSource.instances[0].emit({
      jobs: [
        {
          nodeId: 'node-2',
          output: null,
          predictionId: 'ignored',
          status: 'processing',
        },
        {
          nodeId: 'node-1',
          output: null,
          predictionId: 'kept',
          status: 'processing',
        },
      ],
      nodeResults: [
        {
          nodeId: 'node-1',
          output: { image: 'https://asset.test/node.png' },
          status: 'succeeded',
        },
      ],
      status: 'completed',
    });
    await flushAsyncHandlers();

    expect(mocks.updateNodeData).toHaveBeenCalledWith('node-1', {
      error: undefined,
      outputImage: 'https://asset.test/node.png',
      outputImages: ['https://asset.test/node.png'],
      status: NodeStatusEnum.COMPLETE,
    });
    expect(getState().jobs?.has('kept')).toBe(true);
    expect(getState().jobs?.has('ignored')).toBe(false);
    expect(getState().activeNodeExecutions?.has('node-1')).toBe(false);
    expect(MockEventSource.instances[0].close).toHaveBeenCalled();
  });

  it('logs node-scoped parse and connection errors', async () => {
    const { getState, set } = createState({
      activeNodeExecutions: new Map([
        [
          'node-1',
          {
            eventSource: {} as EventSource,
            executionId: 'execution-1',
            nodeIds: ['node-1'],
          },
        ],
      ]),
    });
    createNodeExecutionSubscription(
      'execution-1',
      'node-1',
      set as never,
      vi.fn() as never,
    );

    MockEventSource.instances[0].emitRaw('{bad json');
    await flushAsyncHandlers();
    MockEventSource.instances[0].error();
    await flushAsyncHandlers();

    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to parse SSE message (node execution)',
      { context: 'ExecutionStore', error: expect.any(SyntaxError) },
    );
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'SSE connection error (node execution)',
      { context: 'ExecutionStore', error: expect.any(Error) },
    );
    expect(getState().activeNodeExecutions?.has('node-1')).toBe(false);
  });
});
