export type NodeInputType =
  | 'image'
  | 'video'
  | 'audio'
  | 'text'
  | 'number'
  | 'boolean'
  | 'any';

export interface NodePort {
  type: NodeInputType;
  label: string;
  required?: boolean;
  multiple?: boolean;
}

export interface NodeConfigField {
  type:
    | 'text'
    | 'number'
    | 'select'
    | 'boolean'
    | 'textarea'
    | 'asset'
    | 'color'
    | 'range';
  label: string;
  required?: boolean;
  defaultValue?: string | number | boolean;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  description?: string;
}

export interface NodeDefinition {
  label: string;
  description: string;
  category: 'input' | 'processing' | 'effects' | 'ai' | 'output' | 'control';
  icon: string;
  inputs: Record<string, NodePort>;
  outputs: Record<string, NodePort>;
  configSchema: Record<string, NodeConfigField>;
  maps?: string;
  isPremium?: boolean;
  isEnabled?: boolean;
}

export type NodeRegistry = Record<string, NodeDefinition>;

export interface NodesByCategory {
  input: NodeDefinition[];
  processing: NodeDefinition[];
  effects: NodeDefinition[];
  ai: NodeDefinition[];
  output: NodeDefinition[];
  control: NodeDefinition[];
}

export interface WorkflowNodePosition {
  x: number;
  y: number;
}

export interface WorkflowNodeData extends Record<string, unknown> {
  label: string;
  config: Record<string, unknown>;
  inputVariableKeys?: string[];
  nodeType: string;
  definition?: NodeDefinition;
}

export interface WorkflowVisualNode {
  id: string;
  type: string;
  position: WorkflowNodePosition;
  data: WorkflowNodeData;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export type InputVariableType =
  | 'image'
  | 'video'
  | 'text'
  | 'number'
  | 'select'
  | 'asset'
  | 'boolean';

export interface InputVariableValidation {
  min?: number;
  max?: number;
  options?: string[];
  pattern?: string;
}

export interface WorkflowInputVariable {
  key: string;
  type: InputVariableType;
  label: string;
  description?: string;
  defaultValue?: unknown;
  required?: boolean;
  validation?: InputVariableValidation;
}

export interface WorkflowBuilderState {
  nodes: WorkflowVisualNode[];
  edges: WorkflowEdge[];
  inputVariables: WorkflowInputVariable[];
  selectedNodeId: string | null;
  isDirty: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  errors: Array<{
    type: 'node' | 'edge' | 'variable';
    nodeId?: string;
    message: string;
  }>;
}

export interface WorkflowSchedule {
  schedule: string;
  timezone: string;
  isScheduleEnabled: boolean;
}

export interface WorkflowData {
  id: string;
  label: string;
  description?: string;
  nodes: WorkflowVisualNode[];
  edges: WorkflowEdge[];
  inputVariables: WorkflowInputVariable[];
}

export interface MarketplaceWorkflow {
  id: string;
  label: string;
  description?: string;
  executionCount: number;
  nodes?: Array<{ type: string }>;
  user?: { firstName?: string; lastName?: string };
  createdAt: string;
}
