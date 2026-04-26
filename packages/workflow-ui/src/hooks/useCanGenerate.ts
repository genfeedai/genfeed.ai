import type { NodeType, WorkflowEdge, WorkflowNode } from '@genfeedai/types';
import { NODE_DEFINITIONS } from '@genfeedai/types';
import { useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { createIdMap } from '../lib/lookups';
import { getNodeOutputForHandle } from '../lib/nodeOutputs';
import {
  CONNECTION_FIELDS,
  validateRequiredSchemaFields,
} from '../lib/schemaValidation';
import { useWorkflowStore } from '../stores/workflowStore';
import { useRequiredInputs } from './useRequiredInputs';

interface MissingItem {
  type: 'connection' | 'data' | 'schema';
  field: string;
  message: string;
}

interface CanGenerateResult {
  /** Whether all validation passes and generation can proceed */
  canGenerate: boolean;
  /** List of missing items with details */
  missingItems: MissingItem[];
  /** Whether all required connections exist */
  hasRequiredConnections: boolean;
  /** Whether all connected nodes have actual data */
  hasConnectedData: boolean;
  /** Whether all required schema fields are filled */
  hasRequiredSchemaFields: boolean;
}

interface UseCanGenerateOptions {
  /** The node ID to validate */
  nodeId: string;
  /** The node type (to look up required inputs from NODE_DEFINITIONS) */
  nodeType: NodeType;
  /** The model's input schema with required array */
  inputSchema?: Record<string, unknown>;
  /** Current schema parameter values */
  schemaParams?: Record<string, unknown>;
}

/**
 * Hook that performs comprehensive validation for the Generate button.
 *
 * Validates:
 * 1. Required connections exist (from NODE_DEFINITIONS)
 * 2. Connected nodes have actual data values (not just edges)
 * 3. Required schema fields from model inputSchema are filled
 *
 * @returns Object with canGenerate boolean and detailed breakdown
 */
export function useCanGenerate({
  nodeId,
  nodeType,
  inputSchema,
  schemaParams,
}: UseCanGenerateOptions): CanGenerateResult {
  const { hasRequiredInputs, missingInputs } = useRequiredInputs(
    nodeId,
    nodeType,
  );
  const getConnectedInputs = useWorkflowStore(
    (state) => state.getConnectedInputs,
  );

  // Optimized selector: only get edges targeting this node
  // Uses useShallow to prevent re-renders when unrelated edges change
  const incomingEdgesSelector = useCallback(
    (state: { edges: WorkflowEdge[] }) =>
      state.edges.filter((e) => e.target === nodeId),
    [nodeId],
  );
  const incomingEdges = useWorkflowStore(useShallow(incomingEdgesSelector));

  // Optimized selector: only get source nodes connected to this node
  // Returns a stable object with just the output data we need
  const connectedOutputsSelector = useCallback(
    (state: { nodes: WorkflowNode[] }) => {
      const outputs: Record<string, string | undefined> = {};
      const nodeMap = createIdMap(state.nodes);
      for (const edge of incomingEdges) {
        const sourceNode = nodeMap.get(edge.source);
        if (sourceNode) {
          outputs[edge.source] = getNodeOutputForHandle(
            sourceNode,
            edge.sourceHandle,
          );
        }
      }
      return outputs;
    },
    [incomingEdges],
  );
  useWorkflowStore(useShallow(connectedOutputsSelector));

  return useMemo(() => {
    const missingItems: MissingItem[] = [];

    // 1. Check required connections exist
    for (const inputId of missingInputs) {
      missingItems.push({
        field: inputId,
        message: `Missing connection: ${inputId}`,
        type: 'connection',
      });
    }

    // 2. Check connected nodes targeting required handles have actual data
    const connectedInputs = getConnectedInputs(nodeId);
    const nodeDef = NODE_DEFINITIONS[nodeType];
    const requiredHandleIds = new Set(
      nodeDef?.inputs.filter((h) => h.required).map((h) => h.id) ?? [],
    );
    let hasRequiredData = true;
    let hasConnectedData = true;

    if (hasRequiredInputs) {
      for (const edge of incomingEdges) {
        const handleId = edge.targetHandle;
        if (!handleId) continue;

        if (!connectedInputs.has(handleId)) {
          hasConnectedData = false;
          if (requiredHandleIds.has(handleId)) {
            hasRequiredData = false;
          }
        }
      }
    }

    // 3. Validate required schema fields
    const schemaValidation = validateRequiredSchemaFields(
      inputSchema,
      schemaParams ?? {},
      CONNECTION_FIELDS,
    );

    for (const field of schemaValidation.missingFields) {
      missingItems.push({
        field,
        message: `Required field: ${field}`,
        type: 'schema',
      });
    }

    const canGenerate =
      hasRequiredInputs && hasRequiredData && schemaValidation.isValid;

    return {
      canGenerate,
      hasConnectedData,
      hasRequiredConnections: hasRequiredInputs,
      hasRequiredSchemaFields: schemaValidation.isValid,
      missingItems,
    };
  }, [
    nodeId,
    nodeType,
    hasRequiredInputs,
    missingInputs,
    inputSchema,
    schemaParams,
    getConnectedInputs,
    incomingEdges,
  ]);
}
