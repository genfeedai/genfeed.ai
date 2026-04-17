export type {
  Workflow as WorkflowDocument,
  WorkflowExecution as WorkflowExecutionDocument,
} from '@genfeedai/prisma';

export type WorkflowRecurrence = {
  type: string;
  timezone?: string;
  endDate?: Date;
  nextRunAt?: Date;
};
