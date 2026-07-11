export type {
  ExecutableEdge,
  ExecutableNode,
  ExecutableWorkflow,
  ExecutionOptions,
  ExecutionProgressEvent,
  ExecutionStatus,
  NodeExecutionStatus,
  NodeStatusChangeEvent,
  RetryConfig,
  ValidationError,
  ValidationResult,
  ValidationWarning,
  WorkflowLifecycle,
} from '../contracts';
export { DEFAULT_RETRY_CONFIG } from '../contracts';

export interface NodeExecutionResult {
  nodeId: string;
  status: import('../contracts').NodeExecutionStatus;
  output?: unknown;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
  retryCount: number;
  creditsUsed: number;
}

export interface ExecutionRunResult {
  runId: string;
  workflowId: string;
  status: import('../contracts').ExecutionStatus;
  nodeResults: Map<string, NodeExecutionResult>;
  totalCreditsUsed: number;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

export interface ExecutionRun {
  runId: string;
  status: import('../contracts').ExecutionStatus;
  executedNodeIds: string[];
  failedNodeId?: string;
  error?: string;
  creditsUsed: number;
  startedAt: Date;
  completedAt?: Date;
  nodeResults: Array<{
    nodeId: string;
    status: import('../contracts').NodeExecutionStatus;
    output?: unknown;
    error?: string;
    startedAt: Date;
    completedAt?: Date;
    retryCount: number;
    creditsUsed: number;
  }>;
}

export interface CreditCostConfig {
  [nodeType: string]: number;
}

export interface CreditEstimate {
  totalCredits: number;
  breakdown: Array<{
    nodeId: string;
    nodeType: string;
    credits: number;
  }>;
  hasInsufficientCredits: boolean;
  availableCredits: number;
}
