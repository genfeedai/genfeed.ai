import type { ActionOriginContext } from '@genfeedai/enums';

/**
 * Post publish queue contract.
 *
 * One job wakes one scheduled post target. The worker re-reads durable post
 * state before publishing, so this payload intentionally carries identifiers
 * plus the non-secret trusted action context needed for provenance. It never
 * carries mutable content or credentials.
 */
export const POST_PUBLISH_JOB_NAME = 'publish-post';

export interface PostPublishJobData {
  actionContext?: ActionOriginContext;
  approvalId?: string;
  enqueuedAt: string;
  operationId?: string;
  organizationId: string;
  postId: string;
  source: 'manual_retry' | 'publish_now' | 'scheduled_sweep';
  userId?: string;
  versionPinId?: string;
}
