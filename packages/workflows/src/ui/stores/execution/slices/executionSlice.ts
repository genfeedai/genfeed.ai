import { NodeStatusEnum } from '@genfeedai/types';
import type { StateCreator } from 'zustand';
import { getWorkflowLogger } from '../../executionLogger';
import { useSettingsStore } from '../../settingsStore';
import { useUIStore } from '../../uiStore';
import { useWorkflowStore } from '../../workflow/workflowStore';
import { getExecutionHeaders, getExecutionHttpClient } from '../executionApi';
import {
  createExecutionSubscription,
  createNodeExecutionSubscription,
} from '../helpers/sseSubscription';
import type { ExecutionData, ExecutionStore, NodeExecution } from '../types';

const LOG_CONTEXT = 'ExecutionStore';

/**
 * Start a workflow execution through the injected HTTP client, carrying the
 * app's provider auth headers (Replicate / Fal / HuggingFace BYOK keys). Both
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
  executeWorkflow: () => Promise<void>;
  executeSelectedNodes: () => Promise<void>;
  executeNode: (nodeId: string) => Promise<void>;
  resumeFromFailed: () => Promise<void>;
  stopExecution: () => void;
  stopNodeExecution: (nodeId: string) => void;
  isNodeExecuting: (nodeId: string) => boolean;
  clearValidationErrors: () => void;
  resetExecution: () => void;
  canResumeFromFailed: () => boolean;
  setEstimatedCost: (cost: number) => void;
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

  executeNode: async (nodeId: string) => {
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
        },
      );
      const executionId = execution._id;

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

  executeSelectedNodes: async () => {
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
        },
      );
      const executionId = execution._id;

      set({ executionId });

      createExecutionSubscription(executionId, set);
    } catch (error) {
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
  executeWorkflow: async () => {
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
        },
      );
      const executionId = execution._id;

      set({ executionId });

      createExecutionSubscription(executionId, set);
    } catch (error) {
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

  isNodeExecuting: (nodeId: string) => {
    const { activeNodeExecutions } = get();
    return activeNodeExecutions.has(nodeId);
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
      const newExecutionId = execution._id;

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

  setEstimatedCost: (cost: number) => {
    set({ estimatedCost: cost });
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
