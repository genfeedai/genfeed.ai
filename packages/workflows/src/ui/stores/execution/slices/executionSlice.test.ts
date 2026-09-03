import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowUIHttpClient } from '../../../provider/types';
import { useSettingsStore } from '../../settingsStore';
import { useUIStore } from '../../uiStore';
import { configureWorkflowPersistence } from '../../workflow/workflowPersistence';
import { useWorkflowStore } from '../../workflow/workflowStore';
import { configureExecutionHttpClient } from '../executionApi';
import { useExecutionStore } from '../executionStore';
import type { NodeExecution } from '../types';

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
}

const post = vi.fn();
const httpClient: WorkflowUIHttpClient = {
  post: post as WorkflowUIHttpClient['post'],
};

function seedValidWorkflow(): string {
  const promptId = useWorkflowStore
    .getState()
    .addNode('promptConstructor', { x: 0, y: 0 });
  const imageId = useWorkflowStore
    .getState()
    .addNode('imageGen', { x: 300, y: 0 });
  useWorkflowStore
    .getState()
    .updateNodeData(promptId, { outputText: 'a castle' });
  useWorkflowStore.setState((state) => ({
    edges: [
      ...state.edges,
      {
        id: `${promptId}-${imageId}`,
        source: promptId,
        sourceHandle: 'text',
        target: imageId,
        targetHandle: 'prompt',
      },
    ],
  }));
  return imageId;
}

beforeEach(() => {
  vi.stubGlobal('EventSource', StubEventSource);
  StubEventSource.instances = [];
  post.mockResolvedValue({ id: 'exec-1', nodeResults: [], status: 'running' });
  configureExecutionHttpClient(httpClient);
  configureWorkflowPersistence({
    create: vi.fn().mockResolvedValue({
      edgeStyle: 'default',
      edges: [],
      id: 'wf-1',
      label: 'Saved',
      nodes: [],
    }),
    delete: vi.fn(),
    duplicate: vi.fn(),
    getAll: vi.fn(),
    getById: vi.fn(),
    update: vi.fn().mockResolvedValue({
      edgeStyle: 'default',
      edges: [],
      id: 'wf-1',
      label: 'Saved',
      nodes: [],
    }),
  });
  useWorkflowStore.setState({
    edges: [],
    groups: [],
    isDirty: false,
    nodes: [],
    selectedNodeIds: [],
    workflowId: 'wf-1',
    workflowName: 'Test',
  });
  useExecutionStore.setState({
    activeNodeExecutions: new Map(),
    actualCost: 0,
    currentNodeId: null,
    debugPayloads: [],
    estimatedCost: 0,
    eventSource: null,
    executingNodeIds: [],
    executionId: null,
    isRunning: false,
    jobs: new Map(),
    lastFailedNodeId: null,
    validationErrors: null,
  });
  useSettingsStore.setState({ debugMode: false });
  useUIStore.setState({ showDebugPanel: false });
});

afterEach(() => {
  configureExecutionHttpClient(undefined);
  configureWorkflowPersistence(undefined);
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('executionSlice — executeWorkflow', () => {
  it('stores validation errors instead of executing an invalid workflow', async () => {
    await useExecutionStore.getState().executeWorkflow();

    expect(post).not.toHaveBeenCalled();
    expect(useExecutionStore.getState().validationErrors?.isValid).toBe(false);
  });

  it('executes a valid workflow and subscribes to updates', async () => {
    seedValidWorkflow();

    await useExecutionStore.getState().executeWorkflow();

    expect(post).toHaveBeenCalledWith(
      '/workflows/wf-1/execute',
      { debugMode: false },
      { headers: {} },
    );
    const state = useExecutionStore.getState();
    expect(state.isRunning).toBe(true);
    expect(state.executionId).toBe('exec-1');
    expect(StubEventSource.instances).toHaveLength(1);
  });

  it('saves a dirty workflow before executing', async () => {
    seedValidWorkflow();
    useWorkflowStore.setState({ isDirty: true });

    await useExecutionStore.getState().executeWorkflow();

    expect(useWorkflowStore.getState().isDirty).toBe(false);
    expect(post).toHaveBeenCalled();
  });

  it('does nothing when already running', async () => {
    useExecutionStore.setState({ isRunning: true });
    await useExecutionStore.getState().executeWorkflow();
    expect(post).not.toHaveBeenCalled();
  });

  it('opens the debug panel in debug mode', async () => {
    seedValidWorkflow();
    useSettingsStore.setState({ debugMode: true });

    await useExecutionStore.getState().executeWorkflow();

    expect(useUIStore.getState().showDebugPanel).toBe(true);
    expect(post).toHaveBeenCalledWith(
      '/workflows/wf-1/execute',
      { debugMode: true },
      { headers: {} },
    );
  });

  it('reports a failed start as a validation error', async () => {
    seedValidWorkflow();
    post.mockRejectedValueOnce(new Error('server exploded'));

    await useExecutionStore.getState().executeWorkflow();

    const state = useExecutionStore.getState();
    expect(state.isRunning).toBe(false);
    expect(state.validationErrors?.errors[0].message).toBe('server exploded');
  });
});

describe('executionSlice — executeSelectedNodes', () => {
  it('requires a selection', async () => {
    await useExecutionStore.getState().executeSelectedNodes();

    expect(post).not.toHaveBeenCalled();
    expect(
      useExecutionStore.getState().validationErrors?.errors[0].message,
    ).toBe('No nodes selected');
  });

  it('executes the selected nodes', async () => {
    const imageId = seedValidWorkflow();
    useWorkflowStore.setState({ selectedNodeIds: [imageId] });

    await useExecutionStore.getState().executeSelectedNodes();

    expect(post).toHaveBeenCalledWith(
      '/workflows/wf-1/execute',
      { debugMode: false, selectedNodeIds: [imageId] },
      { headers: {} },
    );
    expect(useExecutionStore.getState().executingNodeIds).toEqual([imageId]);
    expect(useExecutionStore.getState().isRunning).toBe(true);
  });

  it('reports a failed partial start', async () => {
    const imageId = seedValidWorkflow();
    useWorkflowStore.setState({ selectedNodeIds: [imageId] });
    post.mockRejectedValueOnce(new Error('partial down'));

    await useExecutionStore.getState().executeSelectedNodes();

    expect(useExecutionStore.getState().isRunning).toBe(false);
    expect(
      useExecutionStore.getState().validationErrors?.errors[0].message,
    ).toBe('partial down');
  });
});

describe('executionSlice — executeNode', () => {
  it('starts an independent node execution', async () => {
    const imageId = seedValidWorkflow();

    await useExecutionStore.getState().executeNode(imageId);

    expect(post).toHaveBeenCalledWith(
      '/workflows/wf-1/execute',
      { debugMode: false, selectedNodeIds: [imageId] },
      { headers: {} },
    );
    expect(useExecutionStore.getState().isNodeExecuting(imageId)).toBe(true);
    expect(useExecutionStore.getState().isRunning).toBe(false);
  });

  it('marks the node errored when the start fails', async () => {
    const imageId = seedValidWorkflow();
    post.mockRejectedValueOnce(new Error('no capacity'));

    await useExecutionStore.getState().executeNode(imageId);

    const node = useWorkflowStore.getState().getNodeById(imageId);
    expect(node?.data.status).toBe('error');
    expect(node?.data.error).toBe('no capacity');
    expect(useExecutionStore.getState().isNodeExecuting(imageId)).toBe(false);
  });
});

describe('executionSlice — stop and reset', () => {
  it('stopExecution closes the stream and posts a stop', async () => {
    seedValidWorkflow();
    await useExecutionStore.getState().executeWorkflow();
    const source = StubEventSource.instances[0];
    post.mockClear();
    post.mockResolvedValue({});

    useExecutionStore.getState().stopExecution();

    expect(source.isClosed).toBe(true);
    expect(post).toHaveBeenCalledWith('/executions/exec-1/stop');
    const state = useExecutionStore.getState();
    expect(state.isRunning).toBe(false);
    expect(state.eventSource).toBeNull();
  });

  it('stopNodeExecution closes only the node stream and resets the node', async () => {
    const imageId = seedValidWorkflow();
    await useExecutionStore.getState().executeNode(imageId);
    const source = StubEventSource.instances[0];
    post.mockClear();
    post.mockResolvedValue({});

    useExecutionStore.getState().stopNodeExecution(imageId);

    expect(source.isClosed).toBe(true);
    expect(post).toHaveBeenCalledWith('/executions/exec-1/stop');
    expect(useExecutionStore.getState().isNodeExecuting(imageId)).toBe(false);
    expect(useWorkflowStore.getState().getNodeById(imageId)?.data.status).toBe(
      'idle',
    );
  });

  it('stopNodeExecution without an active execution still resets the node', () => {
    const imageId = seedValidWorkflow();

    useExecutionStore.getState().stopNodeExecution(imageId);

    expect(post).not.toHaveBeenCalled();
    expect(useWorkflowStore.getState().getNodeById(imageId)?.data.status).toBe(
      'idle',
    );
  });

  it('resetExecution closes every stream and clears state', () => {
    const mainSource = new StubEventSource('main');
    const nodeSource = new StubEventSource('node');
    useExecutionStore.setState({
      activeNodeExecutions: new Map<string, NodeExecution>([
        [
          'node-1',
          {
            eventSource: nodeSource as unknown as EventSource,
            executionId: 'exec-2',
            nodeIds: ['node-1'],
          },
        ],
      ]),
      eventSource: mainSource as unknown as EventSource,
      executionId: 'exec-1',
      isRunning: true,
      lastFailedNodeId: 'node-1',
    });

    useExecutionStore.getState().resetExecution();

    expect(mainSource.isClosed).toBe(true);
    expect(nodeSource.isClosed).toBe(true);
    const state = useExecutionStore.getState();
    expect(state.executionId).toBeNull();
    expect(state.isRunning).toBe(false);
    expect(state.activeNodeExecutions.size).toBe(0);
    expect(state.lastFailedNodeId).toBeNull();
  });
});

describe('executionSlice — resumeFromFailed', () => {
  it('does nothing without a failed node', async () => {
    await useExecutionStore.getState().resumeFromFailed();
    expect(post).not.toHaveBeenCalled();
  });

  it('reports resume readiness via canResumeFromFailed', () => {
    expect(useExecutionStore.getState().canResumeFromFailed()).toBe(false);

    useExecutionStore.setState({
      executionId: 'exec-1',
      lastFailedNodeId: 'node-1',
    });
    expect(useExecutionStore.getState().canResumeFromFailed()).toBe(true);

    useExecutionStore.setState({ isRunning: true });
    expect(useExecutionStore.getState().canResumeFromFailed()).toBe(false);
  });

  it('re-executes after a failure and clears the failed marker', async () => {
    const imageId = seedValidWorkflow();
    useExecutionStore.setState({
      executionId: 'exec-0',
      lastFailedNodeId: imageId,
    });

    await useExecutionStore.getState().resumeFromFailed();

    expect(post).toHaveBeenCalledWith(
      '/workflows/wf-1/execute',
      { debugMode: false },
      { headers: {} },
    );
    const state = useExecutionStore.getState();
    expect(state.executionId).toBe('exec-1');
    expect(state.lastFailedNodeId).toBeNull();
    expect(state.isRunning).toBe(true);
  });

  it('reports resume failures', async () => {
    const imageId = seedValidWorkflow();
    useExecutionStore.setState({
      executionId: 'exec-0',
      lastFailedNodeId: imageId,
    });
    post.mockRejectedValueOnce(new Error('resume broken'));

    await useExecutionStore.getState().resumeFromFailed();

    expect(useExecutionStore.getState().isRunning).toBe(false);
    expect(
      useExecutionStore.getState().validationErrors?.errors[0].message,
    ).toBe('resume broken');
  });
});

describe('executionSlice — misc', () => {
  it('setEstimatedCost stores the estimate', () => {
    useExecutionStore.getState().setEstimatedCost(1.25);
    expect(useExecutionStore.getState().estimatedCost).toBe(1.25);
  });

  it('clearValidationErrors resets errors', () => {
    useExecutionStore.setState({
      validationErrors: { errors: [], isValid: false, warnings: [] },
    });
    useExecutionStore.getState().clearValidationErrors();
    expect(useExecutionStore.getState().validationErrors).toBeNull();
  });
});

describe('jobSlice', () => {
  it('addJob, updateJob and getJobByNodeId manage jobs', () => {
    useExecutionStore.getState().addJob('node-1', 'pred-1');

    let job = useExecutionStore.getState().getJobByNodeId('node-1');
    expect(job?.status).toBe('pending');

    useExecutionStore.getState().updateJob('pred-1', {
      progress: 50,
      status: 'processing',
    });
    job = useExecutionStore.getState().getJobByNodeId('node-1');
    expect(job?.status).toBe('processing');
    expect(job?.progress).toBe(50);

    expect(useExecutionStore.getState().getJobByNodeId('zzz')).toBeUndefined();
  });

  it('updateJob ignores unknown prediction ids', () => {
    useExecutionStore.getState().updateJob('missing', { progress: 10 });
    expect(useExecutionStore.getState().jobs.size).toBe(0);
  });

  it('debug payload helpers append and clear', () => {
    useExecutionStore.getState().addDebugPayload({
      input: {},
      model: 'm',
      nodeId: 'n',
      nodeName: 'N',
      nodeType: 'llm',
      timestamp: 't',
    });
    expect(useExecutionStore.getState().debugPayloads).toHaveLength(1);

    useExecutionStore.getState().clearDebugPayloads();
    expect(useExecutionStore.getState().debugPayloads).toEqual([]);
  });
});
