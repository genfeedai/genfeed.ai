import type { WorkflowExecutionStatus } from '@genfeedai/enums';
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
  extends Omit<PrismaWorkflowExecution, 'result'> {
  _id: string;
  workflow?: string | Record<string, unknown>;
  user?: string | Record<string, unknown>;
  organization?: string | Record<string, unknown>;
  inputValues?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  nodeResults: WorkflowNodeResult[];
  progress?: number;
  failedNodeId?: string | null;
  creditsUsed?: number;
  durationMs?: number;
  trigger?: string;
  result?: Record<string, unknown> | null;
  [key: string]: unknown;
}
