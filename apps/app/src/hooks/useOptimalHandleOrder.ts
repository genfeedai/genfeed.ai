import type { HandleDefinition } from '@genfeedai/types';
import { useReactFlow } from '@xyflow/react';
import { useMemo } from 'react';
import { selectEdges } from '@/store/workflow/selectors';
import { useWorkflowStore } from '@/store/workflowStore';

/**
 * Hook that returns input handles sorted by their connected source node Y positions.
 * This prevents edge crossings when nodes are arranged vertically.
 */
export function useOptimalHandleOrder(
  nodeId: string,
  inputs: HandleDefinition[]
): HandleDefinition[] {
  const edges = useWorkflowStore(selectEdges);
  const { getNode } = useReactFlow();

  return useMemo(() => {
    if (inputs.length <= 1) return inputs;

    // Get edges that target this node
    const incomingEdges = edges.filter((e) => e.target === nodeId);

    // Create a map of handleId -> source node Y position
    const handleYPositions = new Map<string, number>();

    for (const edge of incomingEdges) {
      if (!edge.targetHandle) continue;

      const sourceNode = getNode(edge.source);
      if (sourceNode) {
        // If multiple edges connect to same handle, use the average Y
        const existingY = handleYPositions.get(edge.targetHandle);
        if (existingY !== undefined) {
          handleYPositions.set(edge.targetHandle, (existingY + sourceNode.position.y) / 2);
        } else {
          handleYPositions.set(edge.targetHandle, sourceNode.position.y);
        }
      }
    }

    // Sort inputs: connected handles by Y position, unconnected handles keep relative order
    const connectedInputs = inputs.filter((input) => handleYPositions.has(input.id));
    const unconnectedInputs = inputs.filter((input) => !handleYPositions.has(input.id));

    // Sort connected inputs by their source node Y positions
    connectedInputs.sort((a, b) => {
      const yA = handleYPositions.get(a.id) ?? 0;
      const yB = handleYPositions.get(b.id) ?? 0;
      return yA - yB;
    });

    // Interleave: place connected handles at positions that minimize crossings
    // Simple approach: connected handles first (sorted by Y), then unconnected
    return [...connectedInputs, ...unconnectedInputs];
  }, [nodeId, inputs, edges, getNode]);
}
