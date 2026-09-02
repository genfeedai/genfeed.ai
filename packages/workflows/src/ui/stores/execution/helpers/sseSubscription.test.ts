import type { WorkflowNode } from '@genfeedai/contracts/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand';
import { useUIStore } from '../../uiStore';
import type { ExecutionData, ExecutionStore, NodeExecution } from '../types';
import {
  createExecutionSubscription,
  createNodeExecutionSubscription,
} from './sseSubscription';

const updateNodeData = vi.fn();
const propagateOutputsDownstream = vi.fn();
const getNodeById = vi.fn(
  (id: string): WorkflowNode =>
    ({
      data: { label: `Node ${id}` },
      id,
      position: { x: 0, y: 0 },
      type: 'imageGen',
    }) as WorkflowNode,
);

vi.mock('../../workflow/workflowStore', () => ({
  useWorkflowStore: {
    getState: () => ({
      getNodeById,
      propagateOutputsDownstream,
      updateNodeData,
    }),
  },
}));

const loggerError = vi.fn();
vi.mock('../../executionLogger', () => ({
  getWorkflowLogger: () => ({
    debug: vi.fn(),
    error: (...args: unknown[]) => loggerError(...args),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

class StubEventSource {
  static instances: StubEventSource[] = [];
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  readonly url: string;
  isClosed = false;

  constructor(url: string) {
    this.url = url;
    StubEventSource.instances.push(this);
  }

  close(): void {
    this.isClosed = true;
  }

  emit(data: ExecutionData): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

interface TestState {
  state: Partial<ExecutionStore>;
  set: StoreApi<ExecutionStore>['setState'];
  get: StoreApi<ExecutionStore>['getState'];
}

function makeStore(): TestState {
  let state: Partial<ExecutionStore> = {
    activeNodeExecutions: new Map<string, NodeExecution>([
      ['node-1', {} as NodeExecution],
    ]),
    debugPayloads: [],
    isRunning: true,
    jobs: new Map(),
    lastFailedNodeId: null,
  };

  const set = ((
    partial:
      | Partial<ExecutionStore>
      | ((current: ExecutionStore) => Partial<ExecutionStore>),
  ) => {
    const update =
      typeof partial === 'function'
        ? partial(state as ExecutionStore)
        : partial;
    state = { ...state, ...update };
  }) as StoreApi<ExecutionStore>['setState'];

  const get = (() =>
    state as ExecutionStore) as StoreApi<ExecutionStore>['getState'];

  return {
    get,
    set,
    get state() {
      return state;
    },
  };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeData(overrides: Partial<ExecutionData> = {}): ExecutionData {
  return {
    id: 'exec-1',
    nodeResults: [],
    status: 'running',
    workflowId: 'wf-1',
    ...overrides,
  };
}

beforeEach(() => {
  StubEventSource.instances = [];
  vi.stubGlobal('EventSource', StubEventSource);
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ nodeResults: [] }), { status: 200 }),
      ),
  );
  useUIStore.setState({ showDebugPanel: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('createExecutionSubscription', () => {
  it('opens an event source on the execution stream and stores it', () => {
    const store = makeStore();
    const source = createExecutionSubscription('exec-1', store.set);

    expect(StubEventSource.instances).toHaveLength(1);
    expect(StubEventSource.instances[0].url).toContain(
      '/executions/exec-1/stream',
    );
    expect(store.state.eventSource).toBe(source);
  });

  it('applies node results and propagates completed outputs once', async () => {
    const store = makeStore();
    createExecutionSubscription('exec-1', store.set);
    const source = StubEventSource.instances[0];

    const data = makeData({
      nodeResults: [
        {
          nodeId: 'node-1',
          output: { url: 'https://o.png' },
          status: 'complete',
        },
      ],
    });
    source.emit(data);
    await flush();
    source.emit(data);
    await flush();

    expect(updateNodeData).toHaveBeenCalledWith(
      'node-1',
      expect.objectContaining({ status: 'complete' }),
    );
    expect(propagateOutputsDownstream).toHaveBeenCalledTimes(1);
  });

  it('records the last failed node id', async () => {
    const store = makeStore();
    createExecutionSubscription('exec-1', store.set);
    StubEventSource.instances[0].emit(
      makeData({
        nodeResults: [{ error: 'boom', nodeId: 'node-9', status: 'error' }],
        pendingNodes: [
          {
            dependsOn: [],
            nodeData: {},
            nodeId: 'node-10',
            nodeType: 'llm',
          },
        ],
      }),
    );
    await flush();

    expect(store.state.lastFailedNodeId).toBe('node-9');
    expect(store.state.isRunning).toBe(true);
  });

  it('tracks jobs and updates them on status change', async () => {
    const store = makeStore();
    createExecutionSubscription('exec-1', store.set);
    const source = StubEventSource.instances[0];

    source.emit(
      makeData({
        jobs: [
          { nodeId: 'node-1', predictionId: 'pred-1', status: 'processing' },
        ],
      }),
    );
    await flush();
    expect(store.state.jobs?.get('pred-1')?.status).toBe('processing');

    source.emit(
      makeData({
        jobs: [
          {
            nodeId: 'node-1',
            output: { url: 'https://o.png' },
            predictionId: 'pred-1',
            status: 'succeeded',
          },
        ],
      }),
    );
    await flush();
    expect(store.state.jobs?.get('pred-1')?.status).toBe('succeeded');
  });

  it('collects debug payloads and opens the debug panel in debug mode', async () => {
    const store = makeStore();
    createExecutionSubscription('exec-1', store.set);

    StubEventSource.instances[0].emit(
      makeData({
        debugMode: true,
        jobs: [
          {
            nodeId: 'node-1',
            predictionId: 'pred-1',
            result: {
              debugPayload: {
                input: { prompt: 'hello' },
                model: 'test-model',
                timestamp: '2026-01-01T00:00:00Z',
              },
            },
            status: 'processing',
          },
        ],
      }),
    );
    await flush();

    expect(store.state.debugPayloads).toHaveLength(1);
    expect(store.state.debugPayloads?.[0].model).toBe('test-model');
    expect(useUIStore.getState().showDebugPanel).toBe(true);
  });

  it('closes and reconciles when the execution completes', async () => {
    const store = makeStore();
    createExecutionSubscription('exec-1', store.set);
    const source = StubEventSource.instances[0];

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          nodeResults: [
            {
              nodeId: 'node-1',
              output: { url: 'https://final.png' },
              status: 'complete',
            },
          ],
        }),
        { status: 200 },
      ),
    );

    source.emit(makeData({ status: 'completed' }));
    await flush();

    expect(source.isClosed).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/executions/exec-1'),
    );
    expect(store.state.isRunning).toBe(false);
    expect(store.state.eventSource).toBeNull();
    expect(store.state.jobs?.size).toBe(0);
    // reconciliation re-applied the final node state
    expect(updateNodeData).toHaveBeenCalledWith(
      'node-1',
      expect.objectContaining({ status: 'complete' }),
    );
  });

  it('logs when the execution fails', async () => {
    const store = makeStore();
    createExecutionSubscription('exec-1', store.set);

    StubEventSource.instances[0].emit(makeData({ status: 'failed' }));
    await flush();

    expect(loggerError).toHaveBeenCalledWith(
      'Workflow execution failed',
      expect.anything(),
    );
  });

  it('finishes when a node failed and nothing is pending', async () => {
    const store = makeStore();
    createExecutionSubscription('exec-1', store.set);
    const source = StubEventSource.instances[0];

    source.emit(
      makeData({
        nodeResults: [{ error: 'boom', nodeId: 'node-1', status: 'error' }],
      }),
    );
    await flush();

    expect(source.isClosed).toBe(true);
    expect(store.state.isRunning).toBe(false);
  });

  it('logs malformed SSE payloads', async () => {
    const store = makeStore();
    createExecutionSubscription('exec-1', store.set);
    StubEventSource.instances[0].onmessage?.({ data: 'not-json' });
    await flush();

    expect(loggerError).toHaveBeenCalledWith(
      'Failed to parse SSE message',
      expect.anything(),
    );
  });

  it('closes and reconciles on connection error', async () => {
    const store = makeStore();
    const source = createExecutionSubscription('exec-1', store.set);

    StubEventSource.instances[0].onerror?.(new Event('error'));
    await flush();

    expect((source as unknown as StubEventSource).isClosed).toBe(true);
    expect(store.state.eventSource).toBeNull();
    expect(store.state.isRunning).toBe(false);
    expect(loggerError).toHaveBeenCalledWith(
      'SSE connection error',
      expect.anything(),
    );
  });

  it('survives a failing reconciliation fetch', async () => {
    const store = makeStore();
    createExecutionSubscription('exec-1', store.set);
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    StubEventSource.instances[0].emit(makeData({ status: 'completed' }));
    await flush();

    expect(store.state.isRunning).toBe(false);
  });

  it('ignores a non-ok reconciliation response', async () => {
    const store = makeStore();
    createExecutionSubscription('exec-1', store.set);
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 500 }));

    StubEventSource.instances[0].emit(makeData({ status: 'completed' }));
    await flush();

    expect(store.state.isRunning).toBe(false);
  });
});

describe('createNodeExecutionSubscription', () => {
  it('only applies jobs for the scoped node', async () => {
    const store = makeStore();
    createNodeExecutionSubscription('exec-1', 'node-1', store.set, store.get);

    StubEventSource.instances[0].emit(
      makeData({
        jobs: [
          { nodeId: 'node-1', predictionId: 'pred-1', status: 'processing' },
          { nodeId: 'node-2', predictionId: 'pred-2', status: 'processing' },
        ],
      }),
    );
    await flush();

    expect(store.state.jobs?.has('pred-1')).toBe(true);
    expect(store.state.jobs?.has('pred-2')).toBe(false);
  });

  it('removes the node from active executions when done', async () => {
    const store = makeStore();
    createNodeExecutionSubscription('exec-1', 'node-1', store.set, store.get);
    const source = StubEventSource.instances[0];

    source.emit(makeData({ status: 'completed' }));
    await flush();

    expect(source.isClosed).toBe(true);
    expect(store.state.activeNodeExecutions?.has('node-1')).toBe(false);
  });

  it('cleans up on connection error', async () => {
    const store = makeStore();
    createNodeExecutionSubscription('exec-1', 'node-1', store.set, store.get);

    StubEventSource.instances[0].onerror?.(new Event('error'));
    await flush();

    expect(store.state.activeNodeExecutions?.has('node-1')).toBe(false);
    expect(loggerError).toHaveBeenCalledWith(
      'SSE connection error (node execution)',
      expect.anything(),
    );
  });

  it('logs malformed SSE payloads', async () => {
    const store = makeStore();
    createNodeExecutionSubscription('exec-1', 'node-1', store.set, store.get);
    StubEventSource.instances[0].onmessage?.({ data: '{invalid' });
    await flush();

    expect(loggerError).toHaveBeenCalledWith(
      'Failed to parse SSE message (node execution)',
      expect.anything(),
    );
  });
});
