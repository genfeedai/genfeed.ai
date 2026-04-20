export type {
  BatchWorkflowJob,
  BatchWorkflowJob as BatchWorkflowJobDocument,
} from '@genfeedai/prisma';

export enum BatchWorkflowJobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum BatchWorkflowItemStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}
