import type { EdgeStyle, NodeType, WorkflowEdge, WorkflowNode } from '@genfeedai/types';
import { CONNECTION_RULES, NODE_DEFINITIONS } from '@genfeedai/types';
import type { Connection, EdgeChange, NodeChange } from '@xyflow/react';
import { applyEdgeChanges, applyNodeChanges, addEdge as rfAddEdge } from '@xyflow/react';
import type { StateCreator } from 'zustand';
import { generateId, getHandleType } from '../helpers/nodeHelpers';
import type { WorkflowStore } from '../types';

export interface EdgeSlice {
  onNodesChange: (changes: NodeChange<WorkflowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<WorkflowEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  removeEdge: (edgeId: string) => void;
  setEdgeStyle: (style: EdgeStyle) => void;
  toggleEdgePause: (edgeId: string) => void;
  isValidConnection: (connection: Connection) => boolean;
  findCompatibleHandle: (
    sourceNodeId: string,
    sourceHandleId: string | null,
    targetNodeId: string
  ) => string | null;
}

export const createEdgeSlice: StateCreator<WorkflowStore, [], [], EdgeSlice> = (set, get) => ({
  findCompatibleHandle: (sourceNodeId, sourceHandleId, targetNodeId) => {
    const { nodes, edges } = get();

    const sourceNode = nodes.find((n) => n.id === sourceNodeId);
    const targetNode = nodes.find((n) => n.id === targetNodeId);

    if (!sourceNode || !targetNode) return null;

    const sourceType = getHandleType(sourceNode.type as NodeType, sourceHandleId, 'source');

    if (!sourceType) return null;

    const targetDef = NODE_DEFINITIONS[targetNode.type as NodeType];
    if (!targetDef) return null;

    const existingTargetHandles = new Set(
      edges.filter((e) => e.target === targetNodeId).map((e) => e.targetHandle)
    );

    for (const input of targetDef.inputs) {
      // Skip handles that already have connections, unless they support multiple connections
      const hasExistingConnection = existingTargetHandles.has(input.id);
      if (hasExistingConnection && !input.multiple) continue;

      if (CONNECTION_RULES[sourceType]?.includes(input.type)) {
        return input.id;
      }
    }

    return null;
  },

  isValidConnection: (connection) => {
    const { nodes } = get();

    const sourceNode = nodes.find((n) => n.id === connection.source);
    const targetNode = nodes.find((n) => n.id === connection.target);

    if (!sourceNode || !targetNode) return false;

    const sourceType = getHandleType(
      sourceNode.type as NodeType,
      connection.sourceHandle ?? null,
      'source'
    );
    const targetType = getHandleType(
      targetNode.type as NodeType,
      connection.targetHandle ?? null,
      'target'
    );

    if (!sourceType || !targetType) return false;

    return CONNECTION_RULES[sourceType]?.includes(targetType) ?? false;
  },

  onConnect: (connection) => {
    const { isValidConnection, propagateOutputsDownstream } = get();
    if (!isValidConnection(connection)) return;

    set((state) => ({
      edges: rfAddEdge(
        {
          ...connection,
          id: generateId(),
          type: state.edgeStyle,
        },
        state.edges
      ) as WorkflowEdge[],
      isDirty: true,
    }));

    // Propagate outputs when a connection is made
    // This handles both input nodes (prompt, image, etc.) and generation nodes
    // that already have output (e.g., TTS with generated audio → LipSync)
    if (connection.source) {
      propagateOutputsDownstream(connection.source);
    }
  },

  onEdgesChange: (changes) => {
    const hasMeaningfulChange = changes.some(
      (change) => change.type === 'add' || change.type === 'remove' || change.type === 'replace'
    );

    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges) as WorkflowEdge[],
      ...(hasMeaningfulChange && { isDirty: true }),
    }));
  },
  onNodesChange: (changes) => {
    const hasMeaningfulChange = changes.some(
      (change) => change.type === 'add' || change.type === 'remove' || change.type === 'replace'
    );

    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes) as WorkflowNode[],
      ...(hasMeaningfulChange && { isDirty: true }),
    }));
  },

  removeEdge: (edgeId) => {
    set((state) => ({
      edges: state.edges.filter((edge) => edge.id !== edgeId),
      isDirty: true,
    }));
  },

  setEdgeStyle: (style) => {
    set((state) => ({
      edgeStyle: style,
      edges: state.edges.map((edge) => ({ ...edge, type: style })),
      isDirty: true,
    }));
  },

  toggleEdgePause: (edgeId) => {
    set((state) => ({
      edges: state.edges.map((edge) =>
        edge.id === edgeId
          ? {
              ...edge,
              data: {
                ...edge.data,
                hasPause: !edge.data?.hasPause,
              },
            }
          : edge
      ),
      isDirty: true,
    }));
  },
});
