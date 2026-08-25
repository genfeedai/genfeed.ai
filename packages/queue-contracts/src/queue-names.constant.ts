/**
 * Canonical BullMQ queue names shared by producers (api) and consumers
 * (workers). The string values are wire-level contracts persisted in Redis
 * job keys — never change a value without draining the queue first.
 */

export const DEFAULT_QUEUE = 'default';

// ---------- Analytics ----------
export const ANALYTICS_TWITTER_QUEUE = 'analytics-twitter';
export const ANALYTICS_YOUTUBE_QUEUE = 'analytics-youtube';
export const ANALYTICS_SOCIAL_QUEUE = 'analytics-social';
export const ANALYTICS_FACEBOOK_QUEUE = 'analytics-facebook';
export const ANALYTICS_THREADS_QUEUE = 'analytics-threads';
export const ANALYTICS_SYNC_QUEUE = 'analytics-sync';

// ---------- Ads ----------
export const AD_SYNC_META_QUEUE = 'ad-sync-meta';
export const AD_SYNC_GOOGLE_QUEUE = 'ad-sync-google';
export const AD_SYNC_TIKTOK_QUEUE = 'ad-sync-tiktok';
export const AD_BULK_UPLOAD_QUEUE = 'ad-bulk-upload';
export const AD_OPTIMIZATION_QUEUE = 'ad-optimization';

// ---------- Agents & campaigns ----------
export const AGENT_RUN_QUEUE = 'agent-run';
export const CAMPAIGN_PROCESSING_QUEUE = 'campaign-processing';
export const ORCHESTRATOR_RUN_QUEUE = 'orchestrator-run';
export const CAMPAIGN_MEMORY_EXTRACTION_QUEUE = 'campaign-memory-extraction';
export const TRIGGER_EVALUATION_QUEUE = 'triggers.evaluate';

// ---------- Content ----------
export const BATCH_CONTENT_QUEUE = 'batch-content';
/** Agent batch generation (services/batch-generation) — distinct from BATCH_CONTENT_QUEUE. */
export const BATCH_GENERATION_QUEUE = 'batch-generation';
export const CONTENT_OPTIMIZATION_QUEUE = 'content-optimization';
export const CONTENT_PIPELINE_QUEUE = 'content-pipeline';
export const ARTICLE_GENERATION_QUEUE = 'article-generation';
export const PATTERN_EXTRACTION_QUEUE = 'pattern-extraction';
export const POST_PUBLISH_QUEUE = 'post-publish';

// ---------- Clips ----------
export const CLIP_ANALYZE_QUEUE = 'clip-analyze';
export const CLIP_FACTORY_QUEUE = 'clip-factory';

// ---------- Workflows ----------
export const WORKFLOW_EXECUTION_QUEUE = 'workflow-execution';
export const BATCH_WORKFLOW_QUEUE = 'batch-workflow';

// ---------- Distribution & messaging ----------
export const TELEGRAM_DISTRIBUTE_QUEUE = 'telegram-distribute';
export const REPLY_BOT_POLLING_QUEUE = 'reply-bot-polling';
/** Single inbound comment (XAA webhook or post-watch). */
export const REPLY_INBOUND_QUEUE = 'reply-inbound';
/** Delayed watch of one post for new replies (24h series). */
export const REPLY_POST_WATCH_QUEUE = 'reply-post-watch';
export const EMAIL_DIGEST_QUEUE = 'email-digest';
export const LIFECYCLE_EMAIL_QUEUE = 'lifecycle-email';
export const NOTIFICATION_DELIVERY_QUEUE = 'notification-delivery';
export const WEBHOOK_CLIENT_QUEUE = 'webhook-client';
export const SOCIAL_INBOX_SYNC_QUEUE = 'social-inbox-sync';
export const SOCIAL_REPLY_CAMPAIGN_QUEUE = 'social-reply-campaign';

// ---------- Platform ----------
export const WORKSPACE_TASK_QUEUE = 'workspace-task';
export const HEYGEN_POLL_QUEUE = 'heygen-poll';
export const CREDIT_DEDUCTION_QUEUE = 'credit-deduction';
export const SIGNUP_PREFILL_QUEUE = 'signup-prefill';
export const INSIGHT_GENERATION_QUEUE = 'insight-generation';
export const KNOWLEDGE_SOURCE_INGEST_QUEUE = 'knowledge-source-ingest';

export const ALL_QUEUE_NAMES = [
  DEFAULT_QUEUE,
  ANALYTICS_TWITTER_QUEUE,
  ANALYTICS_YOUTUBE_QUEUE,
  ANALYTICS_SOCIAL_QUEUE,
  ANALYTICS_FACEBOOK_QUEUE,
  ANALYTICS_THREADS_QUEUE,
  ANALYTICS_SYNC_QUEUE,
  AD_SYNC_META_QUEUE,
  AD_SYNC_GOOGLE_QUEUE,
  AD_SYNC_TIKTOK_QUEUE,
  AD_BULK_UPLOAD_QUEUE,
  AD_OPTIMIZATION_QUEUE,
  AGENT_RUN_QUEUE,
  CAMPAIGN_PROCESSING_QUEUE,
  ORCHESTRATOR_RUN_QUEUE,
  CAMPAIGN_MEMORY_EXTRACTION_QUEUE,
  TRIGGER_EVALUATION_QUEUE,
  BATCH_CONTENT_QUEUE,
  BATCH_GENERATION_QUEUE,
  CONTENT_OPTIMIZATION_QUEUE,
  CONTENT_PIPELINE_QUEUE,
  ARTICLE_GENERATION_QUEUE,
  PATTERN_EXTRACTION_QUEUE,
  POST_PUBLISH_QUEUE,
  CLIP_ANALYZE_QUEUE,
  CLIP_FACTORY_QUEUE,
  WORKFLOW_EXECUTION_QUEUE,
  BATCH_WORKFLOW_QUEUE,
  TELEGRAM_DISTRIBUTE_QUEUE,
  REPLY_BOT_POLLING_QUEUE,
  REPLY_INBOUND_QUEUE,
  REPLY_POST_WATCH_QUEUE,
  EMAIL_DIGEST_QUEUE,
  LIFECYCLE_EMAIL_QUEUE,
  NOTIFICATION_DELIVERY_QUEUE,
  WEBHOOK_CLIENT_QUEUE,
  SOCIAL_INBOX_SYNC_QUEUE,
  SOCIAL_REPLY_CAMPAIGN_QUEUE,
  WORKSPACE_TASK_QUEUE,
  HEYGEN_POLL_QUEUE,
  CREDIT_DEDUCTION_QUEUE,
  SIGNUP_PREFILL_QUEUE,
  INSIGHT_GENERATION_QUEUE,
  KNOWLEDGE_SOURCE_INGEST_QUEUE,
] as const;

export type QueueName = (typeof ALL_QUEUE_NAMES)[number];

/**
 * Contract queues that have a producer but no registered BullMQ consumer.
 *
 * `default` is the only one. `QueueService.add` and `QueueService.dispatch` both
 * fall back to it, and `queue-diagnostics.controller.ts` probes it, so jobs keep
 * arriving — but no `@Processor(DEFAULT_QUEUE)` exists in the workers runtime, so
 * they sit in `waiting` forever. `pattern-extraction-queue-repair` exists because
 * of exactly that: work misrouted into `default` and stranded.
 *
 * That gap latched `genfeed-production-queues-oldest-waiting` into ALARM on
 * 2026-08-10 against a ~69-day-old job. The aggregate `OldestWaitingAgeSeconds`
 * metric takes the MAX across every queue, so one permanently stranded queue
 * pinned the alarm and it could never return to OK — and an alarm that cannot
 * return to OK can never notify about a *real* backlog again.
 *
 * Unconsumed queues are therefore excluded from the aggregate alert metrics and
 * from per-queue breach alerting, and published per-queue instead so the gap
 * stays visible on the dashboard rather than disappearing.
 *
 * Delete an entry the moment its processor lands.
 * `queue-consumer-coverage.spec.ts` fails if this list drifts from the
 * processors actually registered in the workers runtime.
 */
export const UNCONSUMED_QUEUE_NAMES = [DEFAULT_QUEUE] as const;

const UNCONSUMED_QUEUE_NAME_SET: ReadonlySet<string> = new Set(
  UNCONSUMED_QUEUE_NAMES,
);

/**
 * Queues a worker actually drains. These are the ones whose backlog and waiting
 * age describe an operational problem, so they alone feed the aggregate alarm
 * metrics.
 */
export const CONSUMED_QUEUE_NAMES: readonly QueueName[] =
  ALL_QUEUE_NAMES.filter((name) => !UNCONSUMED_QUEUE_NAME_SET.has(name));

export function hasQueueConsumer(queueName: string): boolean {
  return !UNCONSUMED_QUEUE_NAME_SET.has(queueName);
}
