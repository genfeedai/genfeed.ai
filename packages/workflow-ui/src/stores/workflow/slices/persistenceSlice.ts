import type {
  EdgeStyle,
  NodeType,
  ValidationResult,
  WorkflowEdge,
  WorkflowFile,
  WorkflowNode,
  WorkflowNodeData,
  WorkflowRefNodeData,
} from '@genfeedai/types';
import { NODE_DEFINITIONS } from '@genfeedai/types';
import type { StateCreator } from 'zustand';
import { propagateExistingOutputs } from '../helpers/propagation';
import type { WorkflowData, WorkflowStore } from '../types';

/**
 * Normalize edges loaded from storage to use React Flow edge types.
 * Migrates legacy 'bezier' type to 'default'.
 */
function normalizeEdgeTypes(edges: WorkflowEdge[]): WorkflowEdge[] {
  return edges.map((edge) => ({
    ...edge,
    type: edge.type === 'bezier' ? 'default' : edge.type,
  }));
}

/**
 * Hydrate workflow nodes with default data from NODE_DEFINITIONS.
 * Ensures all required fields exist even for nodes saved before new fields were added.
 * Inlined from @/lib/utils/nodeHydration to avoid app-specific import.
 */
function hydrateWorkflowNodes(nodes: WorkflowNode[]): WorkflowNode[] {
  return nodes.map((node) => {
    const nodeDef = NODE_DEFINITIONS[node.type as NodeType];
    if (!nodeDef) return node;

    return {
      ...node,
      data: {
        ...nodeDef.defaultData,
        ...node.data,
      } as WorkflowNodeData,
    };
  });
}

export interface PersistenceSlice {
  loadWorkflow: (workflow: WorkflowFile) => void;
  clearWorkflow: () => void;
  exportWorkflow: () => WorkflowFile;
  saveWorkflow: (signal?: AbortSignal) => Promise<WorkflowData>;
  loadWorkflowById: (id: string, signal?: AbortSignal) => Promise<void>;
  listWorkflows: (signal?: AbortSignal) => Promise<WorkflowData[]>;
  deleteWorkflow: (id: string, signal?: AbortSignal) => Promise<void>;
  duplicateWorkflowApi: (
    id: string,
    signal?: AbortSignal,
  ) => Promise<WorkflowData>;
  createNewWorkflow: (signal?: AbortSignal) => Promise<string>;
  setWorkflowName: (name: string) => void;
  getNodeById: (id: string) => WorkflowNode | undefined;
  getConnectedInputs: (nodeId: string) => Map<string, string | string[]>;
  getConnectedNodeIds: (nodeIds: string[]) => string[];
  validateWorkflow: () => ValidationResult;
  setDirty: (dirty: boolean) => void;
  getNodesWithComments: () => WorkflowNode[];
  markCommentViewed: (nodeId: string) => void;
  setNavigationTarget: (nodeId: string | null) => void;
  getUnviewedCommentCount: () => number;
}

export const createPersistenceSlice: StateCreator<
  WorkflowStore,
  [],
  [],
  PersistenceSlice
> = (set, get) => ({
  clearWorkflow: () => {
    set({
      edges: [],
      groups: [],
      isDirty: false,
      nodes: [],
      selectedNodeIds: [],
      workflowId: null,
      workflowName: 'Untitled Workflow',
    });
  },

  createNewWorkflow: async () => {
    throw new Error(
      'createNewWorkflow not implemented - consuming app must provide API integration',
    );
  },

  deleteWorkflow: async () => {
    throw new Error(
      'deleteWorkflow not implemented - consuming app must provide API integration',
    );
  },

  duplicateWorkflowApi: async () => {
    throw new Error(
      'duplicateWorkflowApi not implemented - consuming app must provide API integration',
    );
  },

  exportWorkflow: () => {
    const { nodes, edges, edgeStyle, workflowName, groups } = get();
    return {
      createdAt: new Date().toISOString(),
      description: '',
      edgeStyle,
      edges,
      groups,
      name: workflowName,
      nodes,
      updatedAt: new Date().toISOString(),
      version: 1,
    };
  },

  getConnectedInputs: (nodeId) => {
    const { nodes, edges } = get();
    const inputs = new Map<string, string | string[]>();

    const incomingEdges = edges.filter((edge) => edge.target === nodeId);

    for (const edge of incomingEdges) {
      const sourceNode = nodes.find((n) => n.id === edge.source);
      if (!sourceNode) continue;

      const handleId = edge.targetHandle;
      if (!handleId) continue;

      const sourceData = sourceNode.data as WorkflowNodeData & {
        outputImage?: string;
        outputVideo?: string;
        outputText?: string;
        outputAudio?: string;
        prompt?: string;
        image?: string;
        video?: string;
        audio?: string;
      };

      let value: string | null = null;

      if (edge.sourceHandle === 'image') {
        value = sourceData.outputImage ?? sourceData.image ?? null;
      } else if (edge.sourceHandle === 'video') {
        value = sourceData.outputVideo ?? sourceData.video ?? null;
      } else if (edge.sourceHandle === 'text') {
        value = sourceData.outputText ?? sourceData.prompt ?? null;
      } else if (edge.sourceHandle === 'audio') {
        value = sourceData.outputAudio ?? sourceData.audio ?? null;
      }

      if (value) {
        const existing = inputs.get(handleId);
        if (existing) {
          if (Array.isArray(existing)) {
            inputs.set(handleId, [...existing, value]);
          } else {
            inputs.set(handleId, [existing, value]);
          }
        } else {
          inputs.set(handleId, value);
        }
      }
    }

    return inputs;
  },

  getConnectedNodeIds: (nodeIds) => {
    const { edges } = get();
    const connected = new Set<string>(nodeIds);
    const visited = new Set<string>();

    // Traverse UPSTREAM only - find all nodes that feed into the selected nodes
    // This way selecting a node shows its dependencies, not what depends on it
    const queue = [...nodeIds];
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const upstreamEdges = edges.filter((e) => e.target === currentId);
      for (const edge of upstreamEdges) {
        if (!connected.has(edge.source)) {
          connected.add(edge.source);
          queue.push(edge.source);
        }
      }
    }

    return Array.from(connected);
  },

  getNodeById: (id) => {
    return get().nodes.find((node) => node.id === id);
  },

  getNodesWithComments: () => {
    const { nodes } = get();
    return nodes
      .filter((node) => {
        const data = node.data as WorkflowNodeData;
        return data.comment?.trim();
      })
      .sort((a, b) => {
        if (Math.abs(a.position.y - b.position.y) < 50) {
          return a.position.x - b.position.x;
        }
        return a.position.y - b.position.y;
      });
  },

  getUnviewedCommentCount: () => {
    const { nodes, viewedCommentIds } = get();
    return nodes.filter((node) => {
      const data = node.data as WorkflowNodeData;
      return data.comment?.trim() && !viewedCommentIds.has(node.id);
    }).length;
  },

  listWorkflows: async () => {
    throw new Error(
      'listWorkflows not implemented - consuming app must provide API integration',
    );
  },
  loadWorkflow: (workflow) => {
    const hydratedNodes = hydrateWorkflowNodes(workflow.nodes);

    set({
      edgeStyle: workflow.edgeStyle,
      edges: normalizeEdgeTypes(workflow.edges),
      groups: workflow.groups ?? [],
      isDirty: true,
      nodes: hydratedNodes,
      selectedNodeIds: [],
      workflowId: null,
      workflowName: workflow.name,
    });

    // Propagate existing outputs to downstream nodes after load
    propagateExistingOutputs(hydratedNodes, get().propagateOutputsDownstream);

    // Propagation after load is idempotent; don't trigger save cycle
    set({ isDirty: false });
  },

  loadWorkflowById: async () => {
    throw new Error(
      'loadWorkflowById not implemented - consuming app must provide API integration',
    );
  },

  markCommentViewed: (nodeId: string) => {
    set((state) => {
      const newSet = new Set(state.viewedCommentIds);
      newSet.add(nodeId);
      return { viewedCommentIds: newSet };
    });
  },

  // API operations - stubs that throw by default.
  // Consuming apps override these via the store creator or by extending the slice.
  saveWorkflow: async () => {
    throw new Error(
      'saveWorkflow not implemented - consuming app must provide API integration',
    );
  },

  setDirty: (dirty) => {
    set({ isDirty: dirty });
  },

  setNavigationTarget: (nodeId: string | null) => {
    set({ navigationTargetId: nodeId });
  },

  setWorkflowName: (name) => {
    set({ isDirty: true, workflowName: name });
  },

  validateWorkflow: () => {
    const { nodes, edges } = get();
    const errors: {
      nodeId: string;
      message: string;
      severity: 'error' | 'warning';
    }[] = [];
    const warnings: {
      nodeId: string;
      message: string;
      severity: 'error' | 'warning';
    }[] = [];

    if (nodes.length === 0) {
      errors.push({
        message: 'Workflow is empty - add some nodes first',
        nodeId: '',
        severity: 'error',
      });
      return { errors, isValid: false, warnings };
    }

    if (edges.length === 0 && nodes.length > 1) {
      errors.push({
        message: 'No connections - connect your nodes together',
        nodeId: '',
        severity: 'error',
      });
      return { errors, isValid: false, warnings };
    }

    const hasNodeOutput = (node: WorkflowNode): boolean => {
      const data = node.data as WorkflowNodeData & {
        prompt?: string;
        image?: string;
        video?: string;
        audio?: string;
        outputImage?: string;
        outputVideo?: string;
        outputText?: string;
      };

      switch (node.type as NodeType) {
        case 'prompt':
          return Boolean(data.prompt?.trim());
        case 'imageInput':
          return Boolean(data.image);
        case 'videoInput':
          return Boolean(data.video);
        case 'audioInput':
          return Boolean(data.audio);
        default:
          return true;
      }
    };

    for (const node of nodes) {
      const nodeDef = NODE_DEFINITIONS[node.type as NodeType];
      if (!nodeDef) continue;

      const incomingEdges = edges.filter((e) => e.target === node.id);

      for (const input of nodeDef.inputs) {
        if (input.required) {
          const connectionEdge = incomingEdges.find(
            (e) => e.targetHandle === input.id,
          );
          if (!connectionEdge) {
            errors.push({
              message: `Missing required input: ${input.label}`,
              nodeId: node.id,
              severity: 'error',
            });
          } else {
            const sourceNode = nodes.find(
              (n) => n.id === connectionEdge.source,
            );
            if (sourceNode && !hasNodeOutput(sourceNode)) {
              errors.push({
                message: `${(sourceNode.data as WorkflowNodeData).label} is empty`,
                nodeId: sourceNode.id,
                severity: 'error',
              });
            }
          }
        }
      }
    }

    const visited = new Set<string>();
    const recStack = new Set<string>();

    function hasCycle(nodeId: string): boolean {
      if (recStack.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;

      visited.add(nodeId);
      recStack.add(nodeId);

      const outgoing = edges.filter((e) => e.source === nodeId);
      for (const edge of outgoing) {
        if (hasCycle(edge.target)) return true;
      }

      recStack.delete(nodeId);
      return false;
    }

    for (const node of nodes) {
      if (hasCycle(node.id)) {
        errors.push({
          message: 'Workflow contains a cycle',
          nodeId: node.id,
          severity: 'error',
        });
        break;
      }
    }

    for (const node of nodes) {
      if (node.type === 'workflowRef') {
        const refData = node.data as WorkflowRefNodeData;
        if (!refData.referencedWorkflowId) {
          errors.push({
            message: 'Subworkflow node must reference a workflow',
            nodeId: node.id,
            severity: 'error',
          });
        } else if (!refData.cachedInterface) {
          warnings.push({
            message:
              'Subworkflow interface not loaded - refresh to update handles',
            nodeId: node.id,
            severity: 'warning',
          });
        }
      }
    }

    return {
      errors,
      isValid: errors.length === 0,
      warnings,
    };
  },
});
