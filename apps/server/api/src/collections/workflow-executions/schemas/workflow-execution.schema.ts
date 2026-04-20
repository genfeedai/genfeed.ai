import type { WorkflowExecutionStatus } from '@genfeedai/enums';

export type {
  WorkflowExecution,
  WorkflowExecution as WorkflowExecutionDocument,
} from '@genfeedai/prisma';

export type WorkflowNodeResult = {
  nodeId: string;
  nodeType: string;
  status: WorkflowExecutionStatus;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  progress?: number;
};
