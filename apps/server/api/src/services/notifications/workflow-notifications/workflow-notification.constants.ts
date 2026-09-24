import type { FormattedAgentError } from '@genfeedai/agent/server';

export const AGENT_STATUS_NOTIFICATION_TOPIC = 'agent.status';
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
  summary?: string;
  sourcePath?: string;
  strategyId?: string;
  failure?: FormattedAgentError | null;
  version: 1;
  executionId: string;
  workflowId: string;
  workflowLabel: string;
  status: WorkflowOutcome;
  error: string | null;
  trigger: string | null;
}

export function readNotificationSourcePath(value: unknown): string | undefined {
  if (
    typeof value !== 'string' ||
    value.length > 2000 ||
    !/^\/[^/]/.test(value) ||
    [...value].some(
      (character) => character.charCodeAt(0) <= 32 || character === '\\',
    )
  )
    return undefined;
  try {
    const url = new URL(value, 'https://notification.invalid');
    return url.origin === 'https://notification.invalid'
      ? `${url.pathname}${url.search}${url.hash}`
      : undefined;
  } catch {
    return undefined;
  }
}

export interface AgentReviewNotificationPayload {
  version: 1;
  kind: 'agent_review';
  strategyId: string;
  strategyLabel: string;
  postId: string;
  platform: string;
  autoPublishEnabled: boolean;
  approvalStreak: number;
  expired: boolean;
  summary: string;
  sourcePath?: string;
}
