import type { RecordActivityInput } from '@api/services/activity-recording/activity-recording.types';
import {
  type AgentReviewNotificationPayload,
  readNotificationSourcePath,
  type WorkflowOutcome,
  type WorkflowStatusNotificationPayload,
} from '@api/services/notifications/workflow-notifications/workflow-notification.constants';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  type FormattedAgentError,
  formatAgentError,
} from '@genfeedai/agent/server';
import { ActivityKey, ActivitySource } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';

export const WORKFLOW_EXECUTION_ENTITY_MODEL = 'WorkflowExecution';
export const AGENT_STRATEGY_ENTITY_MODEL = 'AgentStrategy';

export interface RecordWorkflowOutcomeInput {
  summary?: string;
  sourcePath?: string;
  strategyId?: string;
  failure?: FormattedAgentError | null;
  isAgentRun?: boolean;
  executionId: string;
  workflowId: string;
  workflowLabel: string;
  workflowOwnerUserId: string;
  actorUserId?: string | null;
  organizationId: string;
  status: WorkflowOutcome;
  error?: string | null;
  trigger?: string | null;
  occurredAt: Date;
}

export interface RecordAgentReviewOutcomeInput {
  organizationId: string;
  brandId: string;
  strategyId: string;
  platform: string;
  postId: string;
  userId: string;
  decisionId: string;
  autoPublishEnabled: boolean;
  approvalStreak: number;
  expired?: boolean;
  occurredAt?: Date;
}

/**
 * The terminal outcome of a workflow execution or agent run, as the activity
 * the recording API stores. The alert policy raises the bell item and email
 * (and, for an agent run with a report, the Telegram/Discord report).
 */
export function buildWorkflowOutcomeActivity(
  input: RecordWorkflowOutcomeInput,
): RecordActivityInput {
  const isAgentRun = input.isAgentRun === true;
  const isFailed = input.status === 'failed';
  const classifiedFailure =
    isAgentRun && isFailed
      ? (input.failure ?? formatAgentError(input.error))
      : null;
  const failure = classifiedFailure
    ? { ...classifiedFailure, detail: null }
    : null;
  const key = isAgentRun
    ? isFailed
      ? ActivityKey.AGENT_RUN_FAILED
      : ActivityKey.AGENT_RUN_COMPLETED
    : isFailed
      ? ActivityKey.WORKFLOW_EXECUTION_FAILED
      : ActivityKey.WORKFLOW_EXECUTION_COMPLETED;
  const sourcePath = readNotificationSourcePath(input.sourcePath);
  const workflowLabel = input.workflowLabel.slice(0, 300);
  const payload: WorkflowStatusNotificationPayload = {
    error: failure || !isFailed ? null : (input.error?.slice(0, 2000) ?? null),
    executionId: input.executionId,
    failure,
    status: input.status,
    trigger: input.trigger ?? null,
    version: 1,
    workflowId: input.workflowId,
    workflowLabel,
    ...(input.summary ? { summary: input.summary.slice(0, 2000) } : {}),
    ...(sourcePath ? { sourcePath } : {}),
    ...(input.strategyId ? { strategyId: input.strategyId } : {}),
  };
  const hasMessagingReport =
    isAgentRun && !!input.strategyId && !!input.summary;

  return {
    alert: {
      actorUserId: input.actorUserId ?? null,
      // Telegram and Discord carry the agent report; without one only the
      // bell and email apply.
      ...(hasMessagingReport ? {} : { channels: ['in_app', 'email'] }),
      deduplicationKey: `${key}/${input.executionId}`,
      occurredAt: input.occurredAt,
      payload: { ...payload },
      source: {
        id: input.executionId,
        type: isAgentRun ? 'agent_run' : 'workflow_execution',
      },
    },
    entityId: input.executionId,
    entityModel: WORKFLOW_EXECUTION_ENTITY_MODEL,
    key,
    organizationId: input.organizationId,
    source: isAgentRun
      ? ActivitySource.AGENT_RUN
      : ActivitySource.WORKFLOW_EXECUTION,
    userId: input.workflowOwnerUserId,
    value: workflowLabel,
  };
}

/**
 * An agent review decision (auto-publish graduated or reverted) or an expired
 * review, as an activity. Resolves the strategy inside the caller's review
 * transaction; returns null when the strategy is gone.
 */
export async function buildAgentReviewActivity(
  transaction: Pick<Prisma.TransactionClient, 'agentStrategy'>,
  input: RecordAgentReviewOutcomeInput,
): Promise<RecordActivityInput | null> {
  const strategy = await transaction.agentStrategy.findFirst({
    select: {
      brand: { select: { slug: true } },
      label: true,
      organization: { select: { slug: true } },
    },
    where: scopedWhere(input.organizationId, {
      brandId: input.brandId,
      id: input.strategyId,
    }),
  });
  if (!strategy) return null;

  const key = input.expired
    ? ActivityKey.AGENT_REVIEW_EXPIRED
    : ActivityKey.AGENT_REVIEW_CHANGED;
  const payload: AgentReviewNotificationPayload = {
    approvalStreak: input.approvalStreak,
    autoPublishEnabled: input.autoPublishEnabled,
    expired: input.expired === true,
    kind: 'agent_review',
    platform: input.platform,
    postId: input.postId,
    strategyId: input.strategyId,
    strategyLabel: strategy.label ?? 'Agent',
    summary: input.expired
      ? `The pending ${input.platform} draft expired before approval. It was not published.`
      : `${input.autoPublishEnabled ? 'Auto-publishing enabled' : 'Review required'} for ${input.platform}. Approval streak: ${input.approvalStreak}.`,
    version: 1,
    ...(strategy.organization.slug && strategy.brand?.slug
      ? {
          sourcePath: `/${encodeURIComponent(strategy.organization.slug)}/${encodeURIComponent(strategy.brand.slug)}/automation/agents/${encodeURIComponent(input.strategyId)}`,
        }
      : {}),
  };

  return {
    alert: {
      actorUserId: input.userId,
      deduplicationKey: `${key}/${input.organizationId}/${input.strategyId}/${encodeURIComponent(input.decisionId)}`,
      occurredAt: input.occurredAt ?? new Date(),
      payload: { ...payload },
      source: { id: input.strategyId, type: 'agent_strategy' },
    },
    brandId: input.brandId,
    entityId: input.strategyId,
    entityModel: AGENT_STRATEGY_ENTITY_MODEL,
    key,
    organizationId: input.organizationId,
    source: ActivitySource.AGENT_REVIEW,
    userId: input.userId,
    value: payload.summary,
  };
}
