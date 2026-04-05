import type { NodeType, WorkflowEdge, WorkflowNode, WorkflowNodeData } from '@genfeedai/types';
import { NODE_DEFINITIONS } from '@genfeedai/types';
import type { XYPosition } from '@xyflow/react';
import type { StateCreator } from 'zustand';
import { generateId } from '../helpers/nodeHelpers';
import {
  getNodeOutput,
  computeDownstreamUpdates,
  hasStateChanged,
  applyNodeUpdates,
} from '../helpers/propagation';
import type { WorkflowStore } from '../types';

export interface NodeSlice {
  addNode: (type: NodeType, position: XYPosition) => string;
  addNodesAndEdges: (nodes: WorkflowNode[], edges: WorkflowEdge[]) => void;
  updateNodeData: <T extends WorkflowNodeData>(nodeId: string, data: Partial<T>) => void;
  removeNode: (nodeId: string) => void;
  duplicateNode: (nodeId: string) => string | null;
  propagateOutputsDownstream: (sourceNodeId: string, outputValue?: string) => void;
}

export const createNodeSlice: StateCreator<WorkflowStore, [], [], NodeSlice> = (set, get) => ({
  addNode: (type, position) => {
    const nodeDef = NODE_DEFINITIONS[type];
    if (!nodeDef) return '';

    const id = generateId();
    const newNode: WorkflowNode = {
      data: {
        ...nodeDef.defaultData,
        label: nodeDef.label,
        status: 'idle',
      } as WorkflowNodeData,
      id,
      position,
      type,
      ...(type === 'download' && { height: 320, width: 280 }),
    };

    set((state) => ({
      isDirty: true,
      nodes: [...state.nodes, newNode],
    }));

    return id;
  },

  addNodesAndEdges: (newNodes, newEdges) => {
    if (newNodes.length === 0) return;

    set((state) => ({
      edges: [...state.edges, ...newEdges],
      isDirty: true,
      nodes: [...state.nodes, ...newNodes],
    }));

    // Propagate outputs for nodes that have existing connections
    const { propagateOutputsDownstream } = get();
    const sourceNodeIds = new Set(newEdges.map((e) => e.source));
    for (const sourceId of sourceNodeIds) {
      propagateOutputsDownstream(sourceId);
    }
  },

  duplicateNode: (nodeId) => {
    const { nodes, edges, edgeStyle, propagateOutputsDownstream } = get();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return null;

    const newId = generateId();
    const newNode: WorkflowNode = {
      ...node,
      data: {
        ...node.data,
        jobId: null,
        status: 'idle',
      } as WorkflowNodeData,
      id: newId,
      position: {
        x: node.position.x + 50,
        y: node.position.y + 50,
      },
    };

    const incomingEdges = edges.filter((e) => e.target === nodeId && e.source !== nodeId);
    const clonedEdges: WorkflowEdge[] = incomingEdges.map((edge) => ({
      ...edge,
      id: generateId(),
      target: newId,
      type: edgeStyle,
    }));

    set((state) => ({
      edges: [...state.edges, ...clonedEdges],
      isDirty: true,
      nodes: [...state.nodes, newNode],
    }));

    const sourcesNotified = new Set<string>();
    for (const edge of incomingEdges) {
      if (!sourcesNotified.has(edge.source)) {
        sourcesNotified.add(edge.source);
        propagateOutputsDownstream(edge.source);
      }
    }

    return newId;
  },

  propagateOutputsDownstream: (sourceNodeId, outputValue?) => {
    const { nodes, edges } = get();
    const sourceNode = nodes.find((n) => n.id === sourceNodeId);
    if (!sourceNode) return;

    const output = outputValue ?? getNodeOutput(sourceNode);
    if (!output) return;

    const updates = computeDownstreamUpdates(sourceNodeId, output, nodes, edges);
    if (updates.size === 0) return;
    if (!hasStateChanged(updates, nodes)) return;

    set((state) => ({
      isDirty: true,
      nodes: applyNodeUpdates(state.nodes, updates),
    }));
  },

  removeNode: (nodeId) => {
    set((state) => ({
      edges: state.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
      isDirty: true,
      nodes: state.nodes.filter((node) => node.id !== nodeId),
    }));
  },

  updateNodeData: (nodeId, data) => {
    const { nodes, propagateOutputsDownstream } = get();
    const node = nodes.find((n) => n.id === nodeId);

    const TRANSIENT_KEYS = new Set(['status', 'progress', 'error', 'jobId']);
    const dataKeys = Object.keys(data as Record<string, unknown>);
    const hasPersistedChange = dataKeys.some((key) => !TRANSIENT_KEYS.has(key));

    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n)),
      ...(hasPersistedChange && { isDirty: true }),
    }));

    const inputNodeTypes = [
      'prompt',
      'image',
      'imageInput',
      'video',
      'videoInput',
      'audio',
      'audioInput',
      'tweetParser',
    ];
    const hasOutputUpdate =
      'outputImage' in data ||
      'outputImages' in data ||
      'outputVideo' in data ||
      'outputAudio' in data ||
      'outputText' in data;

    if (node && (inputNodeTypes.includes(node.type as string) || hasOutputUpdate)) {
      if (hasOutputUpdate) {
        const dataRecord = data as Record<string, unknown>;
        if ('outputImages' in dataRecord) {
          propagateOutputsDownstream(nodeId);
        } else {
          const outputValue =
            dataRecord.outputImage ??
            dataRecord.outputVideo ??
            dataRecord.outputAudio ??
            dataRecord.outputText;
          if (typeof outputValue === 'string') {
            propagateOutputsDownstream(nodeId, outputValue);
          }
        }
      } else {
        propagateOutputsDownstream(nodeId);
      }
    }
  },
});
