import type { NodeStatus, ValidationResult } from '@genfeedai/types';

// =============================================================================
// DEBUG TYPES
// =============================================================================

export interface DebugPayload {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  model: string;
  input: Record<string, unknown>;
  timestamp: string;
}

// =============================================================================
// JOB TYPES
// =============================================================================

export interface Job {
  nodeId: string;
  predictionId: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  progress: number;
  output: unknown | null;
  error: string | null;
  createdAt: string;
}

export interface NodeResult {
  nodeId: string;
  status: string;
  output?: Record<string, unknown>;
  error?: string;
  cost?: number;
}

export interface ExecutionData {
  _id: string;
  workflowId: string;
  status: string;
  debugMode?: boolean;
  nodeResults: NodeResult[];
  pendingNodes?: Array<{
    nodeId: string;
    nodeType: string;
    nodeData: Record<string, unknown>;
    dependsOn: string[];
  }>;
  jobs?: Array<{
    nodeId: string;
    predictionId: string;
    status: string;
    output?: Record<string, unknown>;
    error?: string;
    result?: {
      success?: boolean;
      output?: Record<string, unknown>;
      debugPayload?: {
        model: string;
        input: Record<string, unknown>;
        timestamp: string;
      };
    };
  }>;
}

// =============================================================================
// NODE EXECUTION TYPES
// =============================================================================

export interface NodeExecution {
  executionId: string;
  nodeIds: string[];
  eventSource: EventSource;
}

// =============================================================================
// STORE TYPES
// =============================================================================

export interface ExecutionState {
  isRunning: boolean;
  executionId: string | null;
  currentNodeId: string | null;
  /** Node IDs being executed (for partial execution). Empty = all nodes */
  executingNodeIds: string[];
  validationErrors: ValidationResult | null;
  eventSource: EventSource | null;
  lastFailedNodeId: string | null;
  pausedAtNodeId: string | null;
  jobs: Map<string, Job>;
  estimatedCost: number;
  actualCost: number;
  debugPayloads: DebugPayload[];
  /** Independent per-node executions (Generate button clicks) */
  activeNodeExecutions: Map<string, NodeExecution>;
}

export interface ExecutionActions {
  executeWorkflow: () => Promise<void>;
  executeSelectedNodes: () => Promise<void>;
  executeNode: (nodeId: string) => Promise<void>;
  resumeFromFailed: () => Promise<void>;
  stopExecution: () => void;
  stopNodeExecution: (nodeId: string) => void;
  isNodeExecuting: (nodeId: string) => boolean;
  clearValidationErrors: () => void;
}

export interface JobActions {
  addJob: (nodeId: string, predictionId: string) => void;
  updateJob: (predictionId: string, updates: Partial<Job>) => void;
  getJobByNodeId: (nodeId: string) => Job | undefined;
}

export interface HelperActions {
  resetExecution: () => void;
  canResumeFromFailed: () => boolean;
  setEstimatedCost: (cost: number) => void;
  addDebugPayload: (payload: DebugPayload) => void;
  clearDebugPayloads: () => void;
}

export interface ExecutionStore
  extends ExecutionState,
    ExecutionActions,
    JobActions,
    HelperActions {}

// =============================================================================
// STATUS MAPPING
// =============================================================================

export const STATUS_MAP: Record<string, NodeStatus> = {
  complete: 'complete',
  error: 'error',
  pending: 'idle',
  processing: 'processing',
  succeeded: 'complete',
};
