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
export const EMAIL_DIGEST_QUEUE = 'email-digest';
export const LIFECYCLE_EMAIL_QUEUE = 'lifecycle-email';
export const WEBHOOK_CLIENT_QUEUE = 'webhook-client';

// ---------- Platform ----------
export const WORKSPACE_TASK_QUEUE = 'workspace-task';
export const HEYGEN_POLL_QUEUE = 'heygen-poll';
export const CREDIT_DEDUCTION_QUEUE = 'credit-deduction';

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
  EMAIL_DIGEST_QUEUE,
  LIFECYCLE_EMAIL_QUEUE,
  WEBHOOK_CLIENT_QUEUE,
  WORKSPACE_TASK_QUEUE,
  HEYGEN_POLL_QUEUE,
  CREDIT_DEDUCTION_QUEUE,
] as const;

export type QueueName = (typeof ALL_QUEUE_NAMES)[number];
