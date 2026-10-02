import type { ScheduledPostWorkflowInput } from '@api/collections/posts/services/scheduled-post-workflow-definition';
import type { PublishResult } from '@api/index';
import { TargetExecutionState } from '@genfeedai/contracts';

export function readScheduledDeliveryRequest(
  value: unknown,
): ScheduledPostWorkflowInput {
  const request = readScheduledDeliveryRecord(value);
  const source = String(request.source ?? '');
  if (
    !['manual_retry', 'publish_now', 'scheduled_sweep', 'tiktok_app'].includes(
      source,
    )
  ) {
    throw new Error(
      `Scheduled post delivery received invalid source ${source}`,
    );
  }
  const organizationId = String(request.organizationId ?? '');
  const postId = String(request.postId ?? '');
  if (!organizationId || !postId) {
    throw new Error(
      'Scheduled post delivery requires organizationId and postId',
    );
  }
  return {
    organizationId,
    postId,
    source: source as ScheduledPostWorkflowInput['source'],
  };
}

export function readScheduledDeliveryRecord(
  value: unknown,
): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function readScheduledDeliveryResult(value: unknown): PublishResult {
  const result = readScheduledDeliveryRecord(value);
  const executionState = Object.values(TargetExecutionState).includes(
    result.executionState as TargetExecutionState,
  )
    ? (result.executionState as TargetExecutionState)
    : TargetExecutionState.FAILED;

  return {
    ...(typeof result.error === 'string' ? { error: result.error } : {}),
    executionState,
    externalId:
      typeof result.externalId === 'string' ? result.externalId : null,
    ...(result.isProviderDraft === true ? { isProviderDraft: true } : {}),
    platform: typeof result.platform === 'string' ? result.platform : '',
    success: result.success === true,
    url: typeof result.url === 'string' ? result.url : '',
  };
}
