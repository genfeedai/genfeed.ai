import type { WorkflowMissingInput } from '@genfeedai/contracts/interfaces';
import type { NodeStatus, ValidationResult } from '@genfeedai/contracts/types';

export interface DebugPayload {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  model: string;
  input: Record<string, unknown>;
  timestamp: string;
}

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
  id: string;
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

export interface NodeExecution {
  executionId: string;
  nodeIds: string[];
  eventSource: EventSource;
}

/** The run a missing-input answer belongs to, so it can be sent again. */
export type MissingInputTarget =
  | { kind: 'workflow' }
  | { kind: 'selected' }
  | { kind: 'node'; nodeId: string };

/**
 * A run the API refused because required inputs have no value. The editor asks
 * for them and sends the same run again with `inputValues` filled in.
 */
export interface MissingInputRequest {
  /** Values already sent with the refused run. */
  inputValues: Record<string, unknown>;
  missingInputs: WorkflowMissingInput[];
  target: MissingInputTarget;
}

/** Input values sent along with a run, keyed by workflow input name. */
export interface ExecuteOptions {
  inputValues?: Record<string, unknown>;
}

export interface ExecutionState {
  isRunning: boolean;
  executionId: string | null;
  currentNodeId: string | null;
  /** Node IDs being executed (for partial execution). Empty = all nodes */
  executingNodeIds: string[];
  validationErrors: ValidationResult | null;
  /** Set while the editor waits for values the API reported missing. */
  missingInputRequest: MissingInputRequest | null;
  eventSource: EventSource | null;
  lastFailedNodeId: string | null;
  pausedAtNodeId: string | null;
  jobs: Map<string, Job>;
  actualCost: number;
  debugPayloads: DebugPayload[];
  /** Independent per-node executions (Generate button clicks) */
  activeNodeExecutions: Map<string, NodeExecution>;
}

export interface ExecutionActions {
  executeWorkflow: (options?: ExecuteOptions) => Promise<void>;
  executeSelectedNodes: (options?: ExecuteOptions) => Promise<void>;
  executeNode: (nodeId: string, options?: ExecuteOptions) => Promise<void>;
  /** Runs the refused run again with the values the user entered. */
  submitMissingInputs: (inputValues: Record<string, unknown>) => Promise<void>;
  /** Drops the refused run; nothing is sent. */
  dismissMissingInputs: () => void;
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
  addDebugPayload: (payload: DebugPayload) => void;
  clearDebugPayloads: () => void;
}

export interface ExecutionStore
  extends ExecutionState,
    ExecutionActions,
    JobActions,
    HelperActions {}

export const STATUS_MAP: Record<string, NodeStatus> = {
  complete: 'complete',
  error: 'error',
  pending: 'idle',
  processing: 'processing',
  succeeded: 'complete',
};
