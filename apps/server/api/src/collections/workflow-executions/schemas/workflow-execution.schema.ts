import type { WorkflowExecutionStatus } from '@genfeedai/contracts';
import type { WorkflowExecution as PrismaWorkflowExecution } from '@genfeedai/prisma';

export type WorkflowNodeResult = {
  nodeId: string;
  nodeType: string;
  status: WorkflowExecutionStatus | string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  progress?: number;
  retryCount?: number;
  creditsUsed?: number;
  [key: string]: unknown;
};

export interface WorkflowExecutionDocument
  extends Omit<
    PrismaWorkflowExecution,
    'creditsUsed' | 'durationMs' | 'failedNodeId' | 'progress' | 'result'
  > {
  inputValues?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  nodeResults: WorkflowNodeResult[];
  progress?: number;
  failedNodeId?: string | null;
  creditsUsed?: number;
  durationMs?: number;
  result?: Record<string, unknown> | null;
  [key: string]: unknown;
}
