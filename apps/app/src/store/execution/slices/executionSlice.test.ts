import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
  createExecutionSubscription: vi.fn(),
  createNodeExecutionSubscription: vi.fn(),
  getProviderHeader: vi.fn(),
  loggerError: vi.fn(),
  saveWorkflow: vi.fn(),
  setShowDebugPanel: vi.fn(),
  updateNodeData: vi.fn(),
  validateWorkflow: vi.fn(),
}));

vi.mock('@genfeedai/workflow-ui/stores', () => ({
  useUIStore: {
    getState: () => ({
      setShowDebugPanel: mocks.setShowDebugPanel,
    }),
  },
}));

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    post: mocks.apiPost,
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.loggerError,
  },
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: {
    getState: () => ({
      debugMode: currentSettings.debugMode,
      getProviderHeader: mocks.getProviderHeader,
    }),
  },
}));

vi.mock('@/store/workflowStore', () => ({
  useWorkflowStore: {
    getState: () => currentWorkflow,
  },
}));

vi.mock('../helpers/sseSubscription', () => ({
  createExecutionSubscription: mocks.createExecutionSubscription,
  createNodeExecutionSubscription: mocks.createNodeExecutionSubscription,
}));

import { NodeStatusEnum } from '@genfeedai/types';
import type { ExecutionStore } from '../types';
import { createExecutionSlice } from './executionSlice';

const currentSettings = {
  debugMode: false,
};

const currentWorkflow = {
  isDirty: false,
  nodes: [{ id: 'node-1' }, { id: 'node-2' }],
  saveWorkflow: mocks.saveWorkflow,
  selectedNodeIds: ['node-1'],
  updateNodeData: mocks.updateNodeData,
  validateWorkflow: mocks.validateWorkflow,
  workflowId: 'workflow-1',
};

function createEventSource() {
  return { close: vi.fn() } as unknown as EventSource;
}

function createTestStore(overrides: Partial<ExecutionStore> = {}) {
  let state: ExecutionStore;

  const set = vi.fn(
    (
      update:
        | Partial<ExecutionStore>
        | ((state: ExecutionStore) => Partial<ExecutionStore>),
    ) => {
      const patch = typeof update === 'function' ? update(state) : update;
      state = { ...state, ...patch };
    },
  );
  const get = vi.fn(() => state);

  state = {
    activeNodeExecutions: new Map(),
    actualCost: 0,
    addDebugPayload: vi.fn(),
    addJob: vi.fn(),
    clearDebugPayloads: vi.fn(),
    currentNodeId: null,
    debugPayloads: [],
    estimatedCost: 0,
    eventSource: null,
    executingNodeIds: [],
    executionId: null,
    getJobByNodeId: vi.fn(),
    isRunning: false,
    jobs: new Map(),
    lastFailedNodeId: null,
    pausedAtNodeId: null,
    updateJob: vi.fn(),
    validationErrors: null,
    ...(createExecutionSlice(
      set as never,
      get as never,
      undefined as never,
    ) as unknown as ExecutionStore),
    ...overrides,
  };

  return {
    getState: () => state,
    set,
  };
}

describe('createExecutionSlice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSettings.debugMode = false;
    Object.assign(currentWorkflow, {
      isDirty: false,
      nodes: [{ id: 'node-1' }, { id: 'node-2' }],
      selectedNodeIds: ['node-1'],
      workflowId: 'workflow-1',
    });
    mocks.getProviderHeader.mockImplementation((provider: string) => ({
      [`x-${provider}-key`]: provider,
    }));
    mocks.validateWorkflow.mockReturnValue({
      errors: [],
      isValid: true,
      warnings: [],
    });
    mocks.apiPost.mockResolvedValue({
      _id: 'execution-1',
      nodeResults: [],
      status: 'running',
      workflowId: 'workflow-1',
    });
    mocks.createNodeExecutionSubscription.mockReturnValue(createEventSource());
  });

  it('manages simple execution state helpers', () => {
    const store = createTestStore({
      executionId: 'execution-1',
      isRunning: false,
      lastFailedNodeId: 'node-1',
      validationErrors: {
        errors: [{ message: 'bad', nodeId: '', severity: 'error' }],
        isValid: false,
        warnings: [],
      },
    });

    expect(store.getState().canResumeFromFailed()).toBe(true);
    store.getState().clearValidationErrors();
    store.getState().setEstimatedCost(42);

    expect(store.getState().validationErrors).toBeNull();
    expect(store.getState().estimatedCost).toBe(42);
  });

  it('resets execution, closes active event sources, and clears node statuses', () => {
    const eventSource = createEventSource();
    const nodeEventSource = createEventSource();
    const store = createTestStore({
      activeNodeExecutions: new Map([
        [
          'node-1',
          {
            eventSource: nodeEventSource,
            executionId: 'execution-1',
            nodeIds: ['node-1'],
          },
        ],
      ]),
      eventSource,
      isRunning: true,
      jobs: new Map([['job-1', {} as never]]),
    });

    store.getState().resetExecution();

    expect(eventSource.close).toHaveBeenCalled();
    expect(nodeEventSource.close).toHaveBeenCalled();
    expect(store.getState()).toMatchObject({
      activeNodeExecutions: new Map(),
      currentNodeId: null,
      eventSource: null,
      executionId: null,
      isRunning: false,
      lastFailedNodeId: null,
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('node-1', {
      error: undefined,
      progress: undefined,
      status: NodeStatusEnum.IDLE,
    });
  });

  it('starts a full workflow execution after validation and opens debug mode', async () => {
    currentSettings.debugMode = true;
    const store = createTestStore();

    await store.getState().executeWorkflow();

    expect(mocks.setShowDebugPanel).toHaveBeenCalledWith(true);
    expect(mocks.apiPost).toHaveBeenCalledWith(
      '/workflows/workflow-1/execute',
      { debugMode: true },
      {
        headers: {
          'x-fal-key': 'fal',
          'x-huggingface-key': 'huggingface',
          'x-replicate-key': 'replicate',
        },
      },
    );
    expect(mocks.createExecutionSubscription).toHaveBeenCalledWith(
      'execution-1',
      expect.any(Function),
    );
    expect(store.getState().executionId).toBe('execution-1');
  });

  it('sets validation errors when full workflow validation fails', async () => {
    mocks.validateWorkflow.mockReturnValueOnce({
      errors: [{ message: 'Connect nodes', nodeId: '', severity: 'error' }],
      isValid: false,
      warnings: [],
    });
    const store = createTestStore();

    await store.getState().executeWorkflow();

    expect(mocks.apiPost).not.toHaveBeenCalled();
    expect(store.getState().validationErrors).toMatchObject({
      isValid: false,
    });
  });

  it('executes selected nodes and rejects empty selections', async () => {
    const store = createTestStore();

    await store.getState().executeSelectedNodes();

    expect(mocks.apiPost).toHaveBeenCalledWith(
      '/workflows/workflow-1/execute',
      {
        debugMode: false,
        selectedNodeIds: ['node-1'],
      },
      expect.any(Object),
    );
    expect(store.getState().executingNodeIds).toEqual(['node-1']);
    expect(store.getState().executionId).toBe('execution-1');

    currentWorkflow.selectedNodeIds = [];
    const emptyStore = createTestStore();
    await emptyStore.getState().executeSelectedNodes();

    expect(emptyStore.getState().validationErrors).toMatchObject({
      errors: [{ message: 'No nodes selected', nodeId: '', severity: 'error' }],
      isValid: false,
    });
  });

  it('executes one node and tracks independent node subscriptions', async () => {
    const store = createTestStore();

    await store.getState().executeNode('node-1');

    expect(mocks.apiPost).toHaveBeenCalledWith(
      '/workflows/workflow-1/execute',
      {
        debugMode: false,
        selectedNodeIds: ['node-1'],
      },
      expect.any(Object),
    );
    expect(mocks.createNodeExecutionSubscription).toHaveBeenCalledWith(
      'execution-1',
      'node-1',
      expect.any(Function),
      expect.any(Function),
    );
    expect(store.getState().isNodeExecuting('node-1')).toBe(true);
  });

  it('resumes failed executions and handles missing workflow ids', async () => {
    const store = createTestStore({
      executionId: 'execution-1',
      lastFailedNodeId: 'node-1',
    });

    await store.getState().resumeFromFailed();

    expect(mocks.apiPost).toHaveBeenCalledWith(
      '/workflows/workflow-1/execute',
      { debugMode: false },
      expect.any(Object),
    );
    expect(store.getState()).toMatchObject({
      executionId: 'execution-1',
      lastFailedNodeId: null,
    });

    currentWorkflow.workflowId = null as never;
    const missingWorkflowStore = createTestStore({
      executionId: 'execution-1',
      lastFailedNodeId: 'node-1',
    });
    await missingWorkflowStore.getState().resumeFromFailed();

    expect(missingWorkflowStore.getState().validationErrors).toMatchObject({
      errors: [
        {
          message: 'Workflow must be saved first',
          nodeId: '',
          severity: 'error',
        },
      ],
      isValid: false,
    });
  });

  it('stops full and node executions', async () => {
    const eventSource = createEventSource();
    const nodeEventSource = createEventSource();
    const store = createTestStore({
      activeNodeExecutions: new Map([
        [
          'node-1',
          {
            eventSource: nodeEventSource,
            executionId: 'node-execution-1',
            nodeIds: ['node-1'],
          },
        ],
      ]),
      eventSource,
      executionId: 'execution-1',
      isRunning: true,
    });

    store.getState().stopExecution();
    store.getState().stopNodeExecution('node-1');

    expect(eventSource.close).toHaveBeenCalled();
    expect(nodeEventSource.close).toHaveBeenCalled();
    expect(mocks.apiPost).toHaveBeenCalledWith('/executions/execution-1/stop');
    expect(mocks.apiPost).toHaveBeenCalledWith(
      '/executions/node-execution-1/stop',
    );
    expect(store.getState().activeNodeExecutions.has('node-1')).toBe(false);
    expect(mocks.updateNodeData).toHaveBeenCalledWith('node-1', {
      error: undefined,
      status: NodeStatusEnum.IDLE,
    });
  });

  it('surfaces save and API failures as validation or node errors', async () => {
    const saveError = new Error('save failed');
    currentWorkflow.isDirty = true;
    mocks.saveWorkflow.mockRejectedValueOnce(saveError);
    const selectedStore = createTestStore();

    await selectedStore.getState().executeSelectedNodes();

    expect(selectedStore.getState().validationErrors).toMatchObject({
      errors: [{ message: 'Failed to save workflow' }],
      isValid: false,
    });
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to save workflow before execution',
      { context: 'ExecutionStore', error: saveError },
    );

    currentWorkflow.isDirty = false;
    mocks.apiPost.mockRejectedValueOnce(new Error('node failed'));
    const nodeStore = createTestStore();

    await nodeStore.getState().executeNode('node-1');

    expect(mocks.updateNodeData).toHaveBeenCalledWith('node-1', {
      error: 'node failed',
      status: NodeStatusEnum.ERROR,
    });
  });
});
