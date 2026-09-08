import type {
  EdgeStyle,
  WorkflowEdge,
  WorkflowNode,
} from '@genfeedai/contracts/types';
import type { Connection, EdgeChange, NodeChange } from '@xyflow/react';
import {
  applyEdgeChanges,
  applyNodeChanges,
  addEdge as rfAddEdge,
} from '@xyflow/react';
import type { StateCreator } from 'zustand';
import { createIdMap } from '../../../lib';
import {
  isCompatibleWorkflowHandle,
  resolveWorkflowNodeDefinition,
} from '../../../lib/workflowNodeHandles';
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
    targetNodeId: string,
  ) => string | null;
}

export const createEdgeSlice: StateCreator<WorkflowStore, [], [], EdgeSlice> = (
  set,
  get,
) => ({
  findCompatibleHandle: (sourceNodeId, sourceHandleId, targetNodeId) => {
    const { nodes, isValidConnection } = get();
    const targetNode = nodes.find((node) => node.id === targetNodeId);
    if (!targetNode) return null;
    const definition = resolveWorkflowNodeDefinition(
      targetNode.type,
      targetNode.data,
    );
    for (const input of definition?.inputs ?? []) {
      if (
        isValidConnection({
          source: sourceNodeId,
          sourceHandle: sourceHandleId,
          target: targetNodeId,
          targetHandle: input.id,
        })
      )
        return input.id;
    }
    return null;
  },

  isValidConnection: (connection) => {
    const { nodes, edges } = get();
    if (connection.source === connection.target) return false;
    const nodeMap = createIdMap(nodes);
    const sourceNode = nodeMap.get(connection.source);
    const targetNode = nodeMap.get(connection.target);
    if (!sourceNode || !targetNode) return false;

    const sourceType = getHandleType(
      sourceNode.type,
      connection.sourceHandle ?? null,
      'source',
      sourceNode.data,
    );
    const targetDefinition = resolveWorkflowNodeDefinition(
      targetNode.type,
      targetNode.data,
    );
    const targetHandle = targetDefinition?.inputs.find(
      (handle) => handle.id === connection.targetHandle,
    );
    if (
      !sourceType ||
      !targetHandle ||
      !isCompatibleWorkflowHandle(sourceType, targetHandle.type)
    )
      return false;

    const existingInputs = edges.filter(
      (edge) =>
        edge.target === targetNode.id &&
        edge.targetHandle === connection.targetHandle,
    );
    if (
      existingInputs.some(
        (edge) =>
          edge.source === sourceNode.id &&
          edge.sourceHandle === connection.sourceHandle,
      )
    )
      return false;
    if (existingInputs.length > 0 && !targetHandle.multiple) return false;

    const downstream = new Map<string, string[]>();
    for (const edge of edges) {
      const targets = downstream.get(edge.source) ?? [];
      targets.push(edge.target);
      downstream.set(edge.source, targets);
    }
    const pending = [targetNode.id];
    const visited = new Set<string>();
    while (pending.length > 0) {
      const nodeId = pending.pop();
      if (!nodeId || visited.has(nodeId)) continue;
      if (nodeId === sourceNode.id) return false;
      visited.add(nodeId);
      pending.push(...(downstream.get(nodeId) ?? []));
    }
    return true;
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
        state.edges,
      ) as WorkflowEdge[],
      isDirty: true,
    }));

    // Propagate outputs when a connection is made
    // This handles both input nodes (prompt, image, etc.) and generation nodes
    // that already have output (e.g., TTS with generated audio -> LipSync)
    if (connection.source) {
      propagateOutputsDownstream(connection.source);
    }
  },

  onEdgesChange: (changes) => {
    const hasMeaningfulChange = changes.some(
      (change) =>
        change.type === 'add' ||
        change.type === 'remove' ||
        change.type === 'replace',
    );

    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges) as WorkflowEdge[],
      ...(hasMeaningfulChange && { isDirty: true }),
    }));
  },
  onNodesChange: (changes) => {
    const hasMeaningfulChange = changes.some(
      (change) =>
        change.type === 'add' ||
        change.type === 'remove' ||
        change.type === 'replace' ||
        change.type === 'position',
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
          : edge,
      ),
      isDirty: true,
    }));
  },
});
