export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type NodeExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

export type WorkflowLifecycle = 'draft' | 'published' | 'archived';

export interface ExecutionProgressEvent {
  runId: string;
  workflowId: string;
  progress: number;
  currentNodeId?: string;
  currentNodeLabel?: string;
  completedNodes: string[];
  failedNodes: string[];
  timestamp: Date;
}

export interface NodeStatusChangeEvent {
  runId: string;
  workflowId: string;
  nodeId: string;
  previousStatus: NodeExecutionStatus;
  newStatus: NodeExecutionStatus;
  error?: string;
  output?: unknown;
  timestamp: Date;
}

export interface ExecutionOptions {
  nodeIds?: string[];
  resumeFromNodeId?: string;
  respectLocks?: boolean;
  maxRetries?: number;
  onProgress?: (event: ExecutionProgressEvent) => void;
  onNodeStatusChange?: (event: NodeStatusChangeEvent) => void;
  availableCredits?: number;
  dryRun?: boolean;
}

export interface ExecutableNode {
  id: string;
  type: string;
  label: string;
  config: Record<string, unknown>;
  inputs: string[];
  isLocked?: boolean;
  cachedOutput?: unknown;
}

export interface ExecutableEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface ExecutableWorkflow {
  id: string;
  organizationId: string;
  userId: string;
  nodes: ExecutableNode[];
  edges: ExecutableEdge[];
  lockedNodeIds: string[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  code: string;
  message: string;
  nodeId?: string;
  field?: string;
}

export interface ValidationWarning {
  code: string;
  message: string;
  nodeId?: string;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  backoffMultiplier: 2,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  maxRetries: 3,
};
