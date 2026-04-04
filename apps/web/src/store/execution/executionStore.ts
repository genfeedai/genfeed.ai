import { create } from 'zustand';
import { createExecutionSlice } from './slices/executionSlice';
import { createJobSlice } from './slices/jobSlice';
import type { DebugPayload, ExecutionStore } from './types';

/**
 * Execution Store
 *
 * Manages workflow execution state including jobs, validation, and SSE subscriptions.
 * Split into slices for maintainability:
 *
 * - executionSlice: Core execution operations (run, stop, resume)
 * - jobSlice: Job tracking and management
 */
export const useExecutionStore = create<ExecutionStore>()((...args) => {
  const [set] = args;

  return {
    activeNodeExecutions: new Map(),
    actualCost: 0,

    // Debug payload actions
    addDebugPayload: (payload: DebugPayload) => {
      set((state) => ({
        debugPayloads: [...state.debugPayloads, payload],
      }));
    },

    clearDebugPayloads: () => {
      set({ debugPayloads: [] });
    },
    currentNodeId: null,
    debugPayloads: [],
    estimatedCost: 0,
    eventSource: null,
    executingNodeIds: [],
    executionId: null,
    // Initial state
    isRunning: false,
    jobs: new Map(),
    lastFailedNodeId: null,
    pausedAtNodeId: null,
    validationErrors: null,

    // Compose slices
    ...createJobSlice(...args),
    ...createExecutionSlice(...args),
  };
});

// Re-export types for convenience
export type { ExecutionStore, Job } from './types';
