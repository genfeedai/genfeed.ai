import { NodeStatusEnum } from '@genfeedai/types';
import type { StateCreator } from 'zustand';
import { apiClient } from '@/lib/api/client';
import { logger } from '@/lib/logger';
import { useSettingsStore } from '@/store/settingsStore';
import { useUIStore } from '@genfeedai/workflow-ui/stores';
import { useWorkflowStore } from '@/store/workflowStore';
import {
  createExecutionSubscription,
  createNodeExecutionSubscription,
} from '../helpers/sseSubscription';
import type { ExecutionData, ExecutionStore, NodeExecution } from '../types';

function getExecutionProviderHeaders(): Record<string, string> {
  const settings = useSettingsStore.getState();

  return {
    ...settings.getProviderHeader('replicate'),
    ...settings.getProviderHeader('fal'),
    ...settings.getProviderHeader('huggingface'),
  };
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

export const createExecutionSlice: StateCreator<ExecutionStore, [], [], ExecutionSlice> = (
  set,
  get
) => ({
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

    // Save workflow if dirty (idempotent if already saving)
    if (workflowStore.isDirty || !workflowStore.workflowId) {
      try {
        await workflowStore.saveWorkflow();
      } catch (error) {
        logger.error('Failed to save workflow before node execution', error, {
          context: 'ExecutionStore',
        });
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
      const execution = await apiClient.post<ExecutionData>(
        `/workflows/${workflowId}/execute`,
        {
          debugMode,
          selectedNodeIds: [nodeId],
        },
        {
          headers: getExecutionProviderHeaders(),
        }
      );
      const executionId = execution._id;

      const eventSource = createNodeExecutionSubscription(executionId, nodeId, set, get);

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
      logger.error('Failed to start node execution', error, { context: 'ExecutionStore' });
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
          errors: [{ message: 'No nodes selected', nodeId: '', severity: 'error' }],
          isValid: false,
          warnings: [],
        },
      });
      return;
    }

    set({ validationErrors: null });
    resetExecution();

    if (workflowStore.isDirty || !workflowStore.workflowId) {
      try {
        await workflowStore.saveWorkflow();
      } catch (error) {
        logger.error('Failed to save workflow before execution', error, {
          context: 'ExecutionStore',
        });
        set({
          validationErrors: {
            errors: [{ message: 'Failed to save workflow', nodeId: '', severity: 'error' }],
            isValid: false,
            warnings: [],
          },
        });
        return;
      }
    }

    const workflowId = workflowStore.workflowId;
    if (!workflowId) {
      set({
        validationErrors: {
          errors: [{ message: 'Workflow must be saved first', nodeId: '', severity: 'error' }],
          isValid: false,
          warnings: [],
        },
      });
      return;
    }

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
      const execution = await apiClient.post<ExecutionData>(
        `/workflows/${workflowId}/execute`,
        {
          debugMode,
          selectedNodeIds,
        },
        {
          headers: getExecutionProviderHeaders(),
        }
      );
      const executionId = execution._id;

      set({ executionId });

      createExecutionSubscription(executionId, set);
    } catch (error) {
      logger.error('Failed to start partial execution', error, { context: 'ExecutionStore' });
      set({
        isRunning: false,
        validationErrors: {
          errors: [
            {
              message: error instanceof Error ? error.message : 'Partial execution failed',
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

    if (workflowStore.isDirty || !workflowStore.workflowId) {
      try {
        await workflowStore.saveWorkflow();
      } catch (error) {
        logger.error('Failed to save workflow before execution', error, {
          context: 'ExecutionStore',
        });
        set({
          validationErrors: {
            errors: [{ message: 'Failed to save workflow', nodeId: '', severity: 'error' }],
            isValid: false,
            warnings: [],
          },
        });
        return;
      }
    }

    const workflowId = workflowStore.workflowId;
    if (!workflowId) {
      set({
        validationErrors: {
          errors: [{ message: 'Workflow must be saved first', nodeId: '', severity: 'error' }],
          isValid: false,
          warnings: [],
        },
      });
      return;
    }

    set({ isRunning: true });

    for (const node of workflowStore.nodes) {
      workflowStore.updateNodeData(node.id, {
        error: undefined,
        progress: undefined,
        status: NodeStatusEnum.IDLE,
      });
    }

    try {
      const execution = await apiClient.post<ExecutionData>(
        `/workflows/${workflowId}/execute`,
        {
          debugMode,
        },
        {
          headers: getExecutionProviderHeaders(),
        }
      );
      const executionId = execution._id;

      set({ executionId });

      createExecutionSubscription(executionId, set);
    } catch (error) {
      logger.error('Failed to start workflow execution', error, { context: 'ExecutionStore' });
      set({
        isRunning: false,
        validationErrors: {
          errors: [
            {
              message: error instanceof Error ? error.message : 'Execution failed',
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
          errors: [{ message: 'Workflow must be saved first', nodeId: '', severity: 'error' }],
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
      const execution = await apiClient.post<ExecutionData>(
        `/workflows/${workflowId}/execute`,
        {
          debugMode,
        },
        {
          headers: getExecutionProviderHeaders(),
        }
      );
      const newExecutionId = execution._id;

      set({ executionId: newExecutionId, lastFailedNodeId: null });

      createExecutionSubscription(newExecutionId, set);
    } catch (error) {
      logger.error('Failed to resume execution', error, { context: 'ExecutionStore' });
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
      apiClient.post(`/executions/${executionId}/stop`).catch((error) => {
        logger.error('Failed to stop execution', error, { context: 'ExecutionStore' });
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

      apiClient.post(`/executions/${nodeExecution.executionId}/stop`).catch((error) => {
        logger.error('Failed to stop node execution', error, { context: 'ExecutionStore' });
      });

      set((state) => {
        const newMap = new Map(state.activeNodeExecutions);
        newMap.delete(nodeId);
        return { activeNodeExecutions: newMap };
      });
    }

    const workflowStore = useWorkflowStore.getState();
    workflowStore.updateNodeData(nodeId, { error: undefined, status: NodeStatusEnum.IDLE });
  },
});
