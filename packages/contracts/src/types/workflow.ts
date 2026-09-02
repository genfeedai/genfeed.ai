import type { NodeGroup } from './groups';
import type { NodeType, WorkflowEdge, WorkflowNode } from './nodes';

export enum EdgeStyleEnum {
  DEFAULT = 'default',
  SMOOTHSTEP = 'smoothstep',
  STRAIGHT = 'straight',
}

export type EdgeStyle = `${EdgeStyleEnum}`;

export interface WorkflowFile {
  version: number;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  edgeStyle: EdgeStyle;
  groups?: NodeGroup[];
  createdAt?: string;
  updatedAt?: string;
  metadata?: {
    exportedAt?: string;
    exportedFrom?: string;
    originalId?: string;
  };
}

/**
 * Template node with loose typing for data - used in template definitions
 * where we don't need strict type checking on node data
 */
export interface TemplateNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

/**
 * Template edge - same as WorkflowEdge but defined separately for clarity
 */
export interface TemplateEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

/**
 * Workflow template definition - uses loose typing for node data
 * to allow easy template creation without strict type constraints
 */
export interface WorkflowTemplate {
  version: number;
  name: string;
  description: string;
  nodes: TemplateNode[];
  edges: TemplateEdge[];
  edgeStyle?: EdgeStyle;
  groups?: NodeGroup[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ValidationError {
  nodeId: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export interface ExecutionResult {
  success: boolean;
  outputs: Map<string, unknown>;
  errors: Map<string, string>;
  duration: number;
}
