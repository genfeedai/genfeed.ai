import { NodeStatusEnum } from '@genfeedai/types';
import { useCallback } from 'react';
import { useExecutionStore } from '../stores/executionStore';
import { useWorkflowStore } from '../stores/workflowStore';

/**
 * Hook for triggering and stopping node execution
 *
 * Encapsulates the common pattern of:
 * 1. Setting node status to processing
 * 2. Triggering execution
 * 3. Stopping execution and resetting status
 *
 * @param nodeId - The ID of the node to execute
 * @returns handleGenerate - Callback to trigger node execution
 * @returns handleStop - Callback to stop node execution
 */
export function useNodeExecution(nodeId: string) {
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const executeNode = useExecutionStore((state) => state.executeNode);
  const stopNodeExecution = useExecutionStore(
    (state) => state.stopNodeExecution,
  );

  const handleGenerate = useCallback(() => {
    updateNodeData(nodeId, { status: NodeStatusEnum.PROCESSING });
    executeNode(nodeId);
  }, [nodeId, executeNode, updateNodeData]);

  const handleStop = useCallback(() => {
    stopNodeExecution(nodeId);
  }, [nodeId, stopNodeExecution]);

  return { handleGenerate, handleStop };
}
