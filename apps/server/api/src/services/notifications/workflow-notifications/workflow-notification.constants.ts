export const WORKFLOW_STATUS_NOTIFICATION_TOPIC = 'workflow.status';
export const EMAIL_NOTIFICATION_CHANNEL = 'email';
export const RESEND_NOTIFICATION_PROVIDER = 'resend';

export const NOTIFICATION_DELIVERY_STATUS = {
  DELIVERED: 'delivered',
  FAILED: 'failed',
  PENDING: 'pending',
  PROCESSING: 'processing',
  RETRY_PENDING: 'retry_pending',
  SKIPPED: 'skipped',
} as const;

export type WorkflowOutcome = 'completed' | 'failed';

export interface WorkflowStatusNotificationPayload {
  version: 1;
  executionId: string;
  workflowId: string;
  workflowLabel: string;
  status: WorkflowOutcome;
  error: string | null;
  trigger: string | null;
}
