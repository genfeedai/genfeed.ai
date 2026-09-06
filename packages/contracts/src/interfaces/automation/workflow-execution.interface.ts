import type {
  AgentFailureReason,
  WorkflowExecutionStatus,
  WorkflowExecutionTrigger,
} from '../..';
import type { IAgentFailure } from '../ai/agent-failure.interface';

export interface IWorkflowExecutionNodeResult {
  actionId?: string;
  completedAt?: string;
  creditsUsed?: number;
  durationMs?: number;
  error?: string;
  nodeId: string;
  output?: Record<string, unknown>;
  startedAt?: string;
  status: WorkflowExecutionStatus;
}

export interface IWorkflowExecution {
  failureReason?: AgentFailureReason | null;
  failure?: IAgentFailure | null;
  completedAt?: string;
  createdAt: string;
  creditsUsed: number;
  durationMs?: number;
  error?: string;
  failedNodeId?: string;
  id: string;
  inputValues: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  nodeResults: IWorkflowExecutionNodeResult[];
  organizationId: string;
  progress: number;
  result?: Record<string, unknown>;
  startedAt?: string;
  status: WorkflowExecutionStatus;
  trigger: WorkflowExecutionTrigger;
  updatedAt: string;
  userId: string;
  workflow?: {
    description?: string;
    id: string;
    label: string;
  };
  workflowId: string;
}
