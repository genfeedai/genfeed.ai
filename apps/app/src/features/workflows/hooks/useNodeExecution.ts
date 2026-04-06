'use client';

import { WorkflowNodeStatus } from '@genfeedai/enums';
import {
  selectUpdateNodeData,
  useWorkflowStore,
} from '@genfeedai/workflow-ui/stores';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { useCallback, useRef } from 'react';
import {
  createWorkflowApiService,
  type ExecutionResult,
  type WorkflowApiService,
} from '@/features/workflows/services/workflow-api';

// =============================================================================
// TYPES
// =============================================================================

interface UseNodeExecutionReturn {
  /** Execute a partial workflow for specific node(s) and poll for results */
  executeNode: (nodeId: string) => Promise<void>;
  /** Get the workflow API service instance */
  getService: () => Promise<WorkflowApiService>;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 150; // 5 minutes max

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

// =============================================================================
// HOOK
// =============================================================================

/**
 * Hook that provides node-level execution capabilities.
 *
 * Used by individual workflow nodes to trigger partial execution
 * (running just their node) and polling for results.
 *
 * @example
 * ```tsx
 * function MyNode({ id }: NodeProps) {
 *   const { executeNode } = useNodeExecution();
 *   const handleGenerate = useCallback(() => executeNode(id), [id, executeNode]);
 *   return <button onClick={handleGenerate}>Generate</button>;
 * }
 * ```
 */
export function useNodeExecution(): UseNodeExecutionReturn {
  const getService = useAuthedService(
    createWorkflowApiService,
    EnvironmentService.JWT_LABEL,
  );
  const abortRef = useRef<AbortController | null>(null);
  const updateNodeData = useWorkflowStore(selectUpdateNodeData);

  const executeNode = useCallback(
    async (nodeId: string) => {
      const workflowId = useWorkflowStore.getState().workflowId;
      if (!workflowId) {
        logger.error('Cannot execute node: workflow not saved', { nodeId });
        return;
      }

      // Cancel any previous polling
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;

      // Set node to processing
      updateNodeData(nodeId, { status: WorkflowNodeStatus.PROCESSING });

      try {
        const service = await getService();
        const execution = await service.executePartial(workflowId, [nodeId]);

        // Poll for execution completion
        let attempts = 0;
        while (attempts < MAX_POLL_ATTEMPTS && !signal.aborted) {
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
          if (signal.aborted) {
            break;
          }

          attempts++;
          const result: ExecutionResult = await service.getExecution(
            execution._id,
          );

          // Find this node's result
          const nodeResult = result.nodeResults.find(
            (nr) => nr.nodeId === nodeId,
          );
          if (nodeResult?.output) {
            updateNodeData(nodeId, {
              ...nodeResult.output,
              status: WorkflowNodeStatus.COMPLETE,
            });
          }

          if (TERMINAL_STATUSES.has(result.status)) {
            if (result.status === 'failed') {
              const nodeError = nodeResult?.error || result.error;
              updateNodeData(nodeId, {
                error: nodeError || 'Execution failed',
                status: WorkflowNodeStatus.ERROR,
              });
            }
            break;
          }
        }
      } catch (error) {
        if (!signal.aborted) {
          logger.error('Node execution failed', { error, nodeId, workflowId });
          updateNodeData(nodeId, {
            error: error instanceof Error ? error.message : 'Execution failed',
            status: WorkflowNodeStatus.ERROR,
          });
        }
      }
    },
    [getService, updateNodeData],
  );

  return { executeNode, getService };
}
