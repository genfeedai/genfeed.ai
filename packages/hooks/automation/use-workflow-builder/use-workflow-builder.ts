import { useAuth } from '@clerk/nextjs';
import type {
  NodeDefinition,
  NodesByCategory,
  WorkflowEdge,
  WorkflowInputVariable,
  WorkflowNodeData,
  WorkflowVisualNode,
} from '@genfeedai/interfaces/automation/workflow-builder.interface';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import type {
  Connection,
  Edge,
  Node,
  OnEdgesChange,
  OnNodesChange,
} from '@xyflow/react';
import { addEdge, useEdgesState, useNodesState } from '@xyflow/react';
import { useCallback, useEffect, useState } from 'react';

interface UseWorkflowBuilderOptions {
  workflowId: string;
  initialNodes?: WorkflowVisualNode[];
  initialEdges?: WorkflowEdge[];
  initialVariables?: WorkflowInputVariable[];
}

interface UseWorkflowBuilderReturn {
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
  inputVariables: WorkflowInputVariable[];
  selectedNodeId: string | null;
  isDirty: boolean;
  isSaving: boolean;
  nodesByCategory: NodesByCategory;
  isLoading: boolean;
  error: string | null;
  onNodesChange: OnNodesChange<Node<WorkflowNodeData>>;
  onEdgesChange: OnEdgesChange;
  onConnect: (connection: Connection) => void;
  onNodeSelect: (nodeId: string | null) => void;
  onAddNode: (nodeType: string, position: { x: number; y: number }) => void;
  onUpdateNodeConfig: (nodeId: string, config: Record<string, unknown>) => void;
  onAddVariable: (variable: WorkflowInputVariable) => void;
  onUpdateVariable: (
    key: string,
    updates: Partial<WorkflowInputVariable>,
  ) => void;
  onDeleteVariable: (key: string) => void;
  saveWorkflow: () => Promise<void>;
  validateWorkflow: () => Promise<boolean>;
  runWorkflow: () => Promise<void>;
}

const EMPTY_INITIAL_NODES: WorkflowVisualNode[] = [];
const EMPTY_INITIAL_EDGES: WorkflowEdge[] = [];
const EMPTY_INITIAL_VARIABLES: WorkflowInputVariable[] = [];

// Map visual node type to React Flow node type
const NODE_TYPE_MAP: Record<string, string> = {
  ai: 'ai-node',
  control: 'control-node',
  effects: 'effects-node',
  input: 'input-node',
  output: 'output-node',
  processing: 'process-node',
};

function getReactFlowNodeType(category: string): string {
  return NODE_TYPE_MAP[category] || 'process-node';
}

// Convert workflow nodes to React Flow nodes
function toReactFlowNodes(
  nodes: WorkflowVisualNode[],
  nodeRegistry: Record<string, NodeDefinition>,
): Node<WorkflowNodeData>[] {
  return nodes.map((node) => {
    const definition = nodeRegistry[node.type];
    return {
      data: {
        config: node.data.config || {},
        definition,
        inputVariableKeys: node.data.inputVariableKeys || [],
        label: node.data.label,
        nodeType: node.type,
      },
      id: node.id,
      position: node.position,
      type: getReactFlowNodeType(definition?.category || 'processing'),
    };
  });
}

// Convert workflow edges to React Flow edges
function toReactFlowEdges(edges: WorkflowEdge[]): Edge[] {
  return edges.map((edge) => ({
    animated: true,
    id: edge.id,
    source: edge.source,
    sourceHandle: edge.sourceHandle,
    target: edge.target,
    targetHandle: edge.targetHandle,
    type: 'smoothstep',
  }));
}

export function useWorkflowBuilder({
  workflowId,
  initialNodes = EMPTY_INITIAL_NODES,
  initialEdges = EMPTY_INITIAL_EDGES,
  initialVariables = EMPTY_INITIAL_VARIABLES,
}: UseWorkflowBuilderOptions): UseWorkflowBuilderReturn {
  const { getToken } = useAuth();
  const apiBaseUrl = EnvironmentService.apiEndpoint;
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [inputVariables, setInputVariables] =
    useState<WorkflowInputVariable[]>(initialVariables);
  const [nodeRegistry, setNodeRegistry] = useState<
    Record<string, NodeDefinition>
  >({});
  const [nodesByCategory, setNodesByCategory] = useState<NodesByCategory>({
    ai: [],
    control: [],
    effects: [],
    input: [],
    output: [],
    processing: [],
  });

  // Initialize React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState<
    Node<WorkflowNodeData>
  >([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Fetch node registry on mount
  useEffect(() => {
    const controller = new AbortController();

    async function fetchNodeRegistry() {
      try {
        setIsLoading(true);
        setError(null);

        const token = await resolveClerkToken(getToken);
        // Fetch node registry from API
        const response = await fetch(`${apiBaseUrl}/workflows/nodes/registry`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error('Failed to fetch node registry');
        }

        const data = await response.json();
        setNodeRegistry(data.registry || {});
        setNodesByCategory(
          data.byCategory || {
            ai: [],
            control: [],
            effects: [],
            input: [],
            output: [],
            processing: [],
          },
        );

        // Convert initial nodes/edges to React Flow format
        if (initialNodes.length > 0) {
          setNodes(toReactFlowNodes(initialNodes, data.registry || {}));
        }
        if (initialEdges.length > 0) {
          setEdges(toReactFlowEdges(initialEdges));
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          return;
        }
        const message =
          (err as Error).message || 'Failed to load workflow builder';
        setError(message);
        logger.error(
          'useWorkflowBuilder: fetchNodeRegistry failed',
          err as Error,
        );
      } finally {
        setIsLoading(false);
      }
    }

    fetchNodeRegistry();

    return () => {
      controller.abort();
    };
  }, [initialNodes, initialEdges, setNodes, setEdges, getToken]);

  // Mark as dirty when nodes/edges/variables change
  useEffect(() => {
    setIsDirty(true);
  }, []);

  // Handle edge connections
  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge({ ...connection, animated: true, type: 'smoothstep' }, eds),
      );
    },
    [setEdges],
  );

  // Handle node selection
  const onNodeSelect = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
  }, []);

  // Add a new node
  const onAddNode = useCallback(
    (nodeType: string, position: { x: number; y: number }) => {
      const definition = nodeRegistry[nodeType];
      if (!definition) {
        logger.error(`Node type ${nodeType} not found in registry`);
        return;
      }

      const newNode: Node<WorkflowNodeData> = {
        data: {
          config: {},
          definition,
          inputVariableKeys: [],
          label: definition.label,
          nodeType,
        },
        id: `node_${Date.now()}`,
        position,
        type: getReactFlowNodeType(definition.category),
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [nodeRegistry, setNodes],
  );

  // Update node configuration
  const onUpdateNodeConfig = useCallback(
    (nodeId: string, config: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, config } }
            : node,
        ),
      );
    },
    [setNodes],
  );

  // Variable management
  const onAddVariable = useCallback((variable: WorkflowInputVariable) => {
    setInputVariables((vars) => [...vars, variable]);
  }, []);

  const onUpdateVariable = useCallback(
    (key: string, updates: Partial<WorkflowInputVariable>) => {
      setInputVariables((vars) =>
        vars.map((v) => (v.key === key ? { ...v, ...updates } : v)),
      );
    },
    [],
  );

  const onDeleteVariable = useCallback((key: string) => {
    setInputVariables((vars) => vars.filter((v) => v.key !== key));
  }, []);

  // Save workflow
  const saveWorkflow = useCallback(async () => {
    try {
      setIsSaving(true);

      const workflowNodes: WorkflowVisualNode[] = nodes.map((node) => ({
        data: {
          config: node.data.config,
          inputVariableKeys: node.data.inputVariableKeys,
          label: node.data.label,
          nodeType: node.data.nodeType,
        },
        id: node.id,
        position: node.position,
        type: node.data.nodeType,
      }));

      const workflowEdges: WorkflowEdge[] = edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        sourceHandle: edge.sourceHandle || undefined,
        target: edge.target,
        targetHandle: edge.targetHandle || undefined,
      }));

      const token = await resolveClerkToken(getToken);
      const response = await fetch(`${apiBaseUrl}/workflows/${workflowId}`, {
        body: JSON.stringify({
          edges: workflowEdges,
          inputVariables,
          nodes: workflowNodes,
        }),
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        method: 'PATCH',
      });

      if (!response.ok) {
        throw new Error('Failed to save workflow');
      }

      setIsDirty(false);
      NotificationsService.getInstance().success('Workflow saved');
    } catch (err) {
      logger.error('useWorkflowBuilder: saveWorkflow failed', err as Error);
      NotificationsService.getInstance().error('Failed to save workflow');
    } finally {
      setIsSaving(false);
    }
  }, [workflowId, nodes, edges, inputVariables, getToken]);

  // Validate workflow
  const validateWorkflow = useCallback(async (): Promise<boolean> => {
    try {
      const token = await resolveClerkToken(getToken);
      const response = await fetch(
        `${apiBaseUrl}/workflows/${workflowId}/validate`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          method: 'POST',
        },
      );

      if (!response.ok) {
        throw new Error('Validation request failed');
      }

      const result = await response.json();
      if (result.isValid) {
        NotificationsService.getInstance().success('Workflow is valid');
        return true;
      } else {
        const errorMessages = result.errors
          .map((e: { message: string }) => e.message)
          .join(', ');
        NotificationsService.getInstance().error(
          `Validation errors: ${errorMessages}`,
        );
        return false;
      }
    } catch (err) {
      logger.error('useWorkflowBuilder: validateWorkflow failed', err as Error);
      NotificationsService.getInstance().error('Failed to validate workflow');
      return false;
    }
  }, [workflowId, getToken]);

  // Run workflow
  const runWorkflow = useCallback(async () => {
    try {
      // First save if dirty
      if (isDirty) {
        await saveWorkflow();
      }

      const token = await resolveClerkToken(getToken);
      const response = await fetch(`${apiBaseUrl}/workflow-executions`, {
        body: JSON.stringify({
          workflow: workflowId,
        }),
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to start workflow');
      }

      NotificationsService.getInstance().success('Workflow started');
    } catch (err) {
      logger.error('useWorkflowBuilder: runWorkflow failed', err as Error);
      NotificationsService.getInstance().error('Failed to run workflow');
    }
  }, [workflowId, isDirty, saveWorkflow, getToken]);

  return {
    edges,
    error,
    inputVariables,
    isDirty,
    isLoading,
    isSaving,
    nodes,
    nodesByCategory,
    onAddNode,
    onAddVariable,
    onConnect,
    onDeleteVariable,
    onEdgesChange,
    onNodeSelect,
    onNodesChange,
    onUpdateNodeConfig,
    onUpdateVariable,
    runWorkflow,
    saveWorkflow,
    selectedNodeId,
    validateWorkflow,
  };
}
