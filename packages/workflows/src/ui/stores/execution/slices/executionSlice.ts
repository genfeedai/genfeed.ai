import { NodeStatusEnum } from '@genfeedai/contracts/types';
import type { StateCreator } from 'zustand';
import { getWorkflowLogger } from '../../executionLogger';
import { useSettingsStore } from '../../settingsStore';
import { useUIStore } from '../../uiStore';
import { useWorkflowStore } from '../../workflow/workflowStore';
import { getExecutionHeaders, getExecutionHttpClient } from '../executionApi';
import { readMissingWorkflowInputs } from '../helpers/missingInputError';
import {
  createExecutionSubscription,
  createNodeExecutionSubscription,
} from '../helpers/sseSubscription';
import type {
  ExecuteOptions,
  ExecutionData,
  ExecutionStore,
  MissingInputTarget,
  NodeExecution,
} from '../types';

const LOG_CONTEXT = 'ExecutionStore';

/**
 * Start a workflow execution through the injected HTTP client, carrying the
 * app's provider auth headers (Replicate / Fal / OpenRouter BYOK keys). Both
 * the client and the headers default to the package's standalone behavior when
 * the app has not configured them (see `executionApi`).
 */
function startExecution(
  path: string,
  body: Record<string, unknown>,
): Promise<ExecutionData> {
  return getExecutionHttpClient().post<ExecutionData>(path, body, {
    headers: getExecutionHeaders(),
  });
}

/** The request body member carrying the values a run is started with. */
function inputValuesBody(
  options: ExecuteOptions,
): Pick<ExecuteOptions, 'inputValues'> {
  return options.inputValues && Object.keys(options.inputValues).length > 0
    ? { inputValues: options.inputValues }
    : {};
}

function validationError(message: string) {
  return {
    errors: [{ message, nodeId: '', severity: 'error' as const }],
    isValid: false,
    warnings: [],
  };
}

async function ensureSavedWorkflowId(): Promise<
  { ok: true; workflowId: string } | { message: string; ok: false }
> {
  const workflowStore = useWorkflowStore.getState();

  if (workflowStore.isDirty || !workflowStore.workflowId) {
    try {
      await workflowStore.saveWorkflow();
    } catch (error) {
      getWorkflowLogger().error('Failed to save workflow before execution', {
        context: 'ExecutionStore',
        error,
      });
      return { message: 'Failed to save workflow', ok: false };
    }
  }

  if (!workflowStore.workflowId) {
    return { message: 'Workflow must be saved first', ok: false };
  }

  return { ok: true, workflowId: workflowStore.workflowId };
}

export interface ExecutionSlice {
  executeWorkflow: (options?: ExecuteOptions) => Promise<void>;
  executeSelectedNodes: (options?: ExecuteOptions) => Promise<void>;
  executeNode: (nodeId: string, options?: ExecuteOptions) => Promise<void>;
  submitMissingInputs: (inputValues: Record<string, unknown>) => Promise<void>;
  dismissMissingInputs: () => void;
  resumeFromFailed: () => Promise<void>;
  stopExecution: () => void;
  stopNodeExecution: (nodeId: string) => void;
  isNodeExecuting: (nodeId: string) => boolean;
  clearValidationErrors: () => void;
  resetExecution: () => void;
  canResumeFromFailed: () => boolean;
}

export const createExecutionSlice: StateCreator<
  ExecutionStore,
  [],
  [],
  ExecutionSlice
> = (set, get) => ({
  canResumeFromFailed: () => {
    const { executionId, lastFailedNodeId, isRunning } = get();
    return !isRunning && Boolean(executionId) && Boolean(lastFailedNodeId);
  },

  clearValidationErrors: () => {
    set({ validationErrors: null });
  },

  executeNode: async (nodeId: string, options: ExecuteOptions = {}) => {
    const workflowStore = useWorkflowStore.getState();
    const debugMode = useSettingsStore.getState().debugMode;

    // Save workflow if dirty
    if (workflowStore.isDirty || !workflowStore.workflowId) {
      try {
        await workflowStore.saveWorkflow();
      } catch (error) {
        getWorkflowLogger().error(
          'Failed to save workflow before node execution',
          { context: LOG_CONTEXT, error },
        );
        workflowStore.updateNodeData(nodeId, {
          error: 'Failed to save workflow',
          status: NodeStatusEnum.ERROR,
        });
        return;
      }
    }

    const workflowId = workflowStore.workflowId;
    if (!workflowId) {
      workflowStore.updateNodeData(nodeId, {
        error: 'Workflow must be saved first',
        status: NodeStatusEnum.ERROR,
      });
      return;
    }

    if (debugMode) {
      useUIStore.getState().setShowDebugPanel(true);
    }

    try {
      const execution = await startExecution(
        `/workflows/${workflowId}/execute`,
        {
          debugMode,
          selectedNodeIds: [nodeId],
          ...inputValuesBody(options),
        },
      );
      const executionId = execution.id;

      const eventSource = createNodeExecutionSubscription(
        executionId,
        nodeId,
        set,
        get,
      );

      const nodeExecution: NodeExecution = {
        eventSource,
        executionId,
        nodeIds: [nodeId],
      };

      set((state) => {
        const newMap = new Map(state.activeNodeExecutions);
        newMap.set(nodeId, nodeExecution);
        return { activeNodeExecutions: newMap };
      });
    } catch (error) {
      const missingInputs = readMissingWorkflowInputs(error);
      if (missingInputs) {
        set({
          missingInputRequest: {
            inputValues: options.inputValues ?? {},
            missingInputs,
            target: { kind: 'node', nodeId },
          },
        });
        return;
      }
      getWorkflowLogger().error('Failed to start node execution', {
        context: LOG_CONTEXT,
        error,
      });
      workflowStore.updateNodeData(nodeId, {
        error: error instanceof Error ? error.message : 'Node execution failed',
        status: NodeStatusEnum.ERROR,
      });
    }
  },

  executeSelectedNodes: async (options: ExecuteOptions = {}) => {
    const { isRunning, resetExecution } = get();
    if (isRunning) return;

    const workflowStore = useWorkflowStore.getState();
    const debugMode = useSettingsStore.getState().debugMode;
    const { selectedNodeIds } = workflowStore;

    if (selectedNodeIds.length === 0) {
      set({
        validationErrors: {
          errors: [
            { message: 'No nodes selected', nodeId: '', severity: 'error' },
          ],
          isValid: false,
          warnings: [],
        },
      });
      return;
    }

    set({ validationErrors: null });
    resetExecution();

    const workflowReady = await ensureSavedWorkflowId();
    if (!workflowReady.ok) {
      set({ validationErrors: validationError(workflowReady.message) });
      return;
    }
    const { workflowId } = workflowReady;

    // Track which nodes are being executed for edge highlighting
    set({ executingNodeIds: selectedNodeIds, isRunning: true });

    // Open debug panel if debug mode is active
    if (debugMode) {
      useUIStore.getState().setShowDebugPanel(true);
    }

    for (const nodeId of selectedNodeIds) {
      workflowStore.updateNodeData(nodeId, {
        error: undefined,
        progress: undefined,
        status: NodeStatusEnum.IDLE,
      });
    }

    try {
      const execution = await startExecution(
        `/workflows/${workflowId}/execute`,
        {
          debugMode,
          selectedNodeIds,
          ...inputValuesBody(options),
        },
      );
      const executionId = execution.id;

      set({ executionId });

      createExecutionSubscription(executionId, set);
    } catch (error) {
      const missingInputs = readMissingWorkflowInputs(error);
      if (missingInputs) {
        set({
          executingNodeIds: [],
          isRunning: false,
          missingInputRequest: {
            inputValues: options.inputValues ?? {},
            missingInputs,
            target: { kind: 'selected' },
          },
        });
        return;
      }
      getWorkflowLogger().error('Failed to start partial execution', {
        context: LOG_CONTEXT,
        error,
      });
      set({
        isRunning: false,
        validationErrors: {
          errors: [
            {
              message:
                error instanceof Error
                  ? error.message
                  : 'Partial execution failed',
              nodeId: '',
              severity: 'error',
            },
          ],
          isValid: false,
          warnings: [],
        },
      });
    }
  },
  executeWorkflow: async (options: ExecuteOptions = {}) => {
    const { isRunning, resetExecution } = get();
    if (isRunning) return;

    const workflowStore = useWorkflowStore.getState();
    const debugMode = useSettingsStore.getState().debugMode;

    const validation = workflowStore.validateWorkflow();
    if (!validation.isValid) {
      set({ validationErrors: validation });
      return;
    }

    set({ validationErrors: null });
    resetExecution();

    // Open debug panel if debug mode is active
    if (debugMode) {
      useUIStore.getState().setShowDebugPanel(true);
    }

    const workflowReady = await ensureSavedWorkflowId();
    if (!workflowReady.ok) {
      set({ validationErrors: validationError(workflowReady.message) });
      return;
    }
    const { workflowId } = workflowReady;

    set({ isRunning: true });

    for (const node of workflowStore.nodes) {
      workflowStore.updateNodeData(node.id, {
        error: undefined,
        progress: undefined,
        status: NodeStatusEnum.IDLE,
      });
    }

    try {
      const execution = await startExecution(
        `/workflows/${workflowId}/execute`,
        {
          debugMode,
          ...inputValuesBody(options),
        },
      );
      const executionId = execution.id;

      set({ executionId });

      createExecutionSubscription(executionId, set);
    } catch (error) {
      const missingInputs = readMissingWorkflowInputs(error);
      if (missingInputs) {
        set({
          isRunning: false,
          missingInputRequest: {
            inputValues: options.inputValues ?? {},
            missingInputs,
            target: { kind: 'workflow' },
          },
        });
        return;
      }
      getWorkflowLogger().error('Failed to start workflow execution', {
        context: LOG_CONTEXT,
        error,
      });
      set({
        isRunning: false,
        validationErrors: {
          errors: [
            {
              message:
                error instanceof Error ? error.message : 'Execution failed',
              nodeId: '',
              severity: 'error',
            },
          ],
          isValid: false,
          warnings: [],
        },
      });
    }
  },

  dismissMissingInputs: () => {
    set({ missingInputRequest: null });
  },

  isNodeExecuting: (nodeId: string) => {
    const { activeNodeExecutions } = get();
    return activeNodeExecutions.has(nodeId);
  },

  submitMissingInputs: async (inputValues) => {
    const request = get().missingInputRequest;
    if (!request) return;

    set({ missingInputRequest: null });
    const options: ExecuteOptions = {
      inputValues: { ...request.inputValues, ...inputValues },
    };
    const target: MissingInputTarget = request.target;

    if (target.kind === 'node') {
      await get().executeNode(target.nodeId, options);
    } else if (target.kind === 'selected') {
      await get().executeSelectedNodes(options);
    } else {
      await get().executeWorkflow(options);
    }
  },

  resetExecution: () => {
    const { eventSource, activeNodeExecutions } = get();

    if (eventSource) {
      eventSource.close();
    }

    // Close all active node execution SSE connections
    for (const nodeExecution of activeNodeExecutions.values()) {
      nodeExecution.eventSource.close();
    }

    set({
      activeNodeExecutions: new Map(),
      actualCost: 0,
      currentNodeId: null,
      debugPayloads: [],
      eventSource: null,
      executingNodeIds: [],
      executionId: null,
      isRunning: false,
      jobs: new Map(),
      lastFailedNodeId: null,
    });

    const workflowStore = useWorkflowStore.getState();
    for (const node of workflowStore.nodes) {
      workflowStore.updateNodeData(node.id, {
        error: undefined,
        progress: undefined,
        status: NodeStatusEnum.IDLE,
      });
    }
  },

  resumeFromFailed: async () => {
    const { isRunning, executionId, lastFailedNodeId } = get();
    if (isRunning || !executionId || !lastFailedNodeId) return;

    const workflowStore = useWorkflowStore.getState();
    const debugMode = useSettingsStore.getState().debugMode;
    const workflowId = workflowStore.workflowId;

    if (!workflowId) {
      set({
        validationErrors: {
          errors: [
            {
              message: 'Workflow must be saved first',
              nodeId: '',
              severity: 'error',
            },
          ],
          isValid: false,
          warnings: [],
        },
      });
      return;
    }

    set({ isRunning: true, validationErrors: null });

    // Open debug panel if debug mode is active
    if (debugMode) {
      useUIStore.getState().setShowDebugPanel(true);
    }

    workflowStore.updateNodeData(lastFailedNodeId, {
      error: undefined,
      progress: undefined,
      status: NodeStatusEnum.IDLE,
    });

    try {
      const execution = await startExecution(
        `/workflows/${workflowId}/execute`,
        {
          debugMode,
        },
      );
      const newExecutionId = execution.id;

      set({ executionId: newExecutionId, lastFailedNodeId: null });

      createExecutionSubscription(newExecutionId, set);
    } catch (error) {
      getWorkflowLogger().error('Failed to resume execution', {
        context: LOG_CONTEXT,
        error,
      });
      set({
        isRunning: false,
        validationErrors: {
          errors: [
            {
              message: error instanceof Error ? error.message : 'Resume failed',
              nodeId: '',
              severity: 'error',
            },
          ],
          isValid: false,
          warnings: [],
        },
      });
    }
  },

  stopExecution: () => {
    const { eventSource, executionId } = get();

    if (eventSource) {
      eventSource.close();
    }

    if (executionId) {
      getExecutionHttpClient()
        .post(`/executions/${executionId}/stop`)
        .catch((error) => {
          getWorkflowLogger().error('Failed to stop execution', {
            context: LOG_CONTEXT,
            error,
          });
        });
    }

    set({
      currentNodeId: null,
      eventSource: null,
      isRunning: false,
    });
  },

  stopNodeExecution: (nodeId: string) => {
    const { activeNodeExecutions } = get();
    const nodeExecution = activeNodeExecutions.get(nodeId);

    if (nodeExecution) {
      nodeExecution.eventSource.close();

      getExecutionHttpClient()
        .post(`/executions/${nodeExecution.executionId}/stop`)
        .catch((error) => {
          getWorkflowLogger().error('Failed to stop node execution', {
            context: LOG_CONTEXT,
            error,
          });
        });

      set((state) => {
        const newMap = new Map(state.activeNodeExecutions);
        newMap.delete(nodeId);
        return { activeNodeExecutions: newMap };
      });
    }

    const workflowStore = useWorkflowStore.getState();
    workflowStore.updateNodeData(nodeId, {
      error: undefined,
      status: NodeStatusEnum.IDLE,
    });
  },
});
