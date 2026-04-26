import type { NodeType, WorkflowEdge } from '@genfeedai/types';
import { NODE_DEFINITIONS } from '@genfeedai/types';
import { useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useWorkflowStore } from '../stores/workflowStore';

interface RequiredInputsResult {
  /** Whether all required inputs have connections */
  hasRequiredInputs: boolean;
  /** List of missing required input handle IDs */
  missingInputs: string[];
  /** Map of handle ID to whether it's connected */
  connectionStatus: Map<string, boolean>;
}

/**
 * Hook that checks if all required inputs for a node are connected.
 * Uses edge connections, not actual data values.
 *
 * @param nodeId - The node ID to check
 * @param nodeType - The node type (to look up required inputs from NODE_DEFINITIONS)
 * @returns Object with hasRequiredInputs boolean and details about missing inputs
 */
export function useRequiredInputs(
  nodeId: string,
  nodeType: NodeType,
): RequiredInputsResult {
  const incomingEdgesSelector = useCallback(
    (state: { edges: WorkflowEdge[] }) =>
      state.edges.filter((edge) => edge.target === nodeId),
    [nodeId],
  );
  const incomingEdges = useWorkflowStore(useShallow(incomingEdgesSelector));

  return useMemo(() => {
    const nodeDef = NODE_DEFINITIONS[nodeType];
    if (!nodeDef) {
      return {
        connectionStatus: new Map(),
        hasRequiredInputs: true,
        missingInputs: [],
      };
    }

    // Get edges that target this node
    const connectedHandles = new Set(
      incomingEdges.map((e) => e.targetHandle).filter(Boolean),
    );

    // Check each input handle
    const connectionStatus = new Map<string, boolean>();
    const missingInputs: string[] = [];

    for (const input of nodeDef.inputs) {
      const isConnected = connectedHandles.has(input.id);
      connectionStatus.set(input.id, isConnected);

      if (input.required && !isConnected) {
        missingInputs.push(input.id);
      }
    }

    return {
      connectionStatus,
      hasRequiredInputs: missingInputs.length === 0,
      missingInputs,
    };
  }, [incomingEdges, nodeType]);
}
