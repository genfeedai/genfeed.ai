/**
 * Post publish queue contract.
 *
 * One job wakes one scheduled post target. The worker re-reads durable post
 * state before publishing, so this payload intentionally carries identifiers
 * only and never carries trusted execution state.
 */
export const POST_PUBLISH_JOB_NAME = 'publish-post';

export interface PostPublishJobData {
  enqueuedAt: string;
  organizationId: string;
  postId: string;
  source: 'publish_now' | 'scheduled_sweep';
  userId?: string;
}
