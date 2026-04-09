import type {
  NodeDefinition,
  NodesByCategory,
  WorkflowEdge,
  WorkflowInputVariable,
  WorkflowNodeData,
  WorkflowNodePosition,
  WorkflowVisualNode,
} from '@genfeedai/interfaces/automation/workflow-builder.interface';
import type { DragEvent } from 'react';

export interface WorkflowCanvasNode {
  id: string;
  position: WorkflowNodePosition;
  data: WorkflowNodeData;
  type?: string;
}

export interface WorkflowCanvasConnection {
  source?: string | null;
  sourceHandle?: string | null;
  target?: string | null;
  targetHandle?: string | null;
}

export interface WorkflowBuilderProps {
  workflowId: string;
  initialNodes?: WorkflowVisualNode[];
  initialEdges?: WorkflowEdge[];
  initialVariables?: WorkflowInputVariable[];
  onSave?: (data: {
    nodes: WorkflowVisualNode[];
    edges: WorkflowEdge[];
    inputVariables: WorkflowInputVariable[];
  }) => Promise<void>;
  isReadOnly?: boolean;
}

export interface WorkflowCanvasProps {
  nodes: WorkflowCanvasNode[];
  edges: WorkflowEdge[];
  onNodesChange: (changes: unknown[]) => void;
  onEdgesChange: (changes: unknown[]) => void;
  onConnect: (connection: WorkflowCanvasConnection) => void;
  onNodeSelect: (nodeId: string | null) => void;
  onDrop: (event: DragEvent, position: { x: number; y: number }) => void;
  isReadOnly?: boolean;
}

export interface NodePaletteProps {
  nodesByCategory: NodesByCategory;
  onDragStart: (event: DragEvent, nodeType: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export interface NodePaletteCategoryProps {
  category: string;
  nodes: NodeDefinition[];
  onDragStart: (event: DragEvent, nodeType: string) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export interface NodePaletteItemProps {
  nodeType: string;
  definition: NodeDefinition;
  onDragStart: (event: DragEvent, nodeType: string) => void;
}

export interface NodeConfigPanelProps {
  selectedNode: WorkflowCanvasNode | null;
  onUpdateConfig: (nodeId: string, config: Record<string, unknown>) => void;
  inputVariables: WorkflowInputVariable[];
  onClose: () => void;
}

export interface VariablesPanelProps {
  variables: WorkflowInputVariable[];
  onAdd: (variable: WorkflowInputVariable) => void;
  onUpdate: (key: string, variable: Partial<WorkflowInputVariable>) => void;
  onDelete: (key: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export interface VariableItemProps {
  variable: WorkflowInputVariable;
  onUpdate: (updates: Partial<WorkflowInputVariable>) => void;
  onDelete: () => void;
}

export interface BaseNodeProps {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
  isConnectable?: boolean;
}

export interface InputNodeProps extends BaseNodeProps {
  data: WorkflowNodeData & {
    nodeType: string;
  };
}

export interface ProcessNodeProps extends BaseNodeProps {
  data: WorkflowNodeData & {
    nodeType: string;
  };
}

export interface EffectsNodeProps extends BaseNodeProps {
  data: WorkflowNodeData & {
    nodeType: string;
  };
}

export interface AINodeProps extends BaseNodeProps {
  data: WorkflowNodeData & {
    nodeType: string;
  };
}

export interface OutputNodeProps extends BaseNodeProps {
  data: WorkflowNodeData & {
    nodeType: string;
  };
}

export interface ControlNodeProps extends BaseNodeProps {
  data: WorkflowNodeData & {
    nodeType: string;
  };
}

export interface WorkflowToolbarProps {
  workflowId: string;
  workflowLabel: string;
  isDirty: boolean;
  isSaving: boolean;
  onSave: () => void;
  onValidate: () => void;
  onRun: () => void;
  onSchedule: () => void;
  onHistory: () => void;
  onExportComfyUI?: () => void;
  hasComfyUITemplate?: boolean;
  isReadOnly?: boolean;
}

export interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSchedule?: string;
  currentTimezone?: string;
  isEnabled?: boolean;
  onSave: (schedule: string, timezone: string, isEnabled: boolean) => void;
}

export interface RunWorkflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  inputVariables: WorkflowInputVariable[];
  onRun: (inputValues: Record<string, unknown>) => void;
}

export interface WorkflowBuilderRouteProps {
  params: Promise<{ id: string }>;
}

export interface WorkflowBuilderPageProps {
  workflowId: string;
}
