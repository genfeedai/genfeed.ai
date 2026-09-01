import { TRANSCRIPT_PURGE_SCHEDULE } from '@workers/crons/transcript-purge/transcript-purge.constants';

/**
 * One code-owned catalog for deployment-global recurring work.
 *
 * Customer-owned schedules remain database-backed Workflow records and fire on
 * the workflow-execution queue. Platform schedules are reviewed code and fire
 * on this dedicated queue. Both domains use BullMQ Job Schedulers; neither may
 * use process-local Nest timers.
 *
 * The Redis queue name is retained as a wire-level compatibility contract so
 * the bootstrap reconciliation can remove only the explicitly known scheduler
 * ids created by the retired system-sweep manifest.
 */
export const PLATFORM_SCHEDULE_QUEUE = 'system-sweeps';

export const PLATFORM_SCHEDULED_TASKS = {
  BATCH_CREDIT_SETTLEMENT_RECONCILE: 'batch-credit-settlement-reconcile',
  BATCH_GENERATION_RECONCILE: 'batch-generation-reconcile',
  BYOK_MONTHLY_BILLING: 'byok-monthly-billing',
  CREDENTIAL_TOKEN_REFRESH: 'credential-token-refresh',
  EDITOR_RENDER_RECONCILE: 'editor-render-reconcile',
  ENGAGEMENT_TRIGGERS: 'engagement-triggers',
  FAL_MODEL_DISCOVERY: 'fal-model-discovery',
  GLOBAL_TRENDS_REFRESH: 'global-trends-refresh',
  INGREDIENT_METADATA_REFRESH: 'ingredient-metadata-refresh',
  INGREDIENT_PROCESSING_RECONCILE: 'ingredient-processing-reconcile',
  LLM_IDLE_SHUTDOWN: 'llm-idle-shutdown',
  MODEL_DEPRECATION: 'model-deprecation',
  NOTIFICATION_DELIVERY_RECOVERY: 'notification-delivery-recovery',
  PATTERN_EXTRACTION: 'pattern-extraction',
  POSTS_PUBLISH: 'posts-publish',
  QUEUE_METRICS_PUBLISH: 'queue-metrics-publish',
  RAW_CUT_CLIP_RECONCILE: 'raw-cut-clip-reconcile',
  REFERRAL_REWARD_SETTLEMENT: 'referral-reward-settlement',
  REPLICATE_MODEL_DISCOVERY: 'replicate-model-discovery',
  REVIEW_GATE_TIMEOUT: 'review-gate-timeout',
  RSS_AUTOPOST: 'rss-autopost',
  STREAK_MAINTENANCE: 'streak-maintenance',
  TIKTOK_STATUS: 'tiktok-status',
  TRANSCRIPT_PURGE: 'transcript-purge',
  WORKFLOW_ARTIFACT_CLEANUP: 'workflow-artifact-cleanup',
  WORKFLOW_CONTINUATION_RECONCILE: 'workflow-continuation-reconcile',
  YOUTUBE_MESSAGES: 'youtube-messages',
  YOUTUBE_STATUS: 'youtube-status',
} as const;

export type PlatformScheduledTaskName =
  (typeof PLATFORM_SCHEDULED_TASKS)[keyof typeof PLATFORM_SCHEDULED_TASKS];

export type PlatformSchedule = {
  pattern: string;
  timezone: 'UTC';
};

export const PLATFORM_SCHEDULE_CATALOG = {
  [PLATFORM_SCHEDULED_TASKS.BATCH_CREDIT_SETTLEMENT_RECONCILE]: {
    pattern: '*/5 * * * *',
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.BATCH_GENERATION_RECONCILE]: {
    pattern: '*/5 * * * *',
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.BYOK_MONTHLY_BILLING]: {
    pattern: '0 2 1 * *',
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.CREDENTIAL_TOKEN_REFRESH]: {
    pattern: '0 * * * *',
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.EDITOR_RENDER_RECONCILE]: {
    pattern: '* * * * *',
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.ENGAGEMENT_TRIGGERS]: {
    pattern: '*/15 * * * *',
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.FAL_MODEL_DISCOVERY]: {
    pattern: '0 7 * * 0',
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.GLOBAL_TRENDS_REFRESH]: {
    pattern: '0 15 0,12 * * *',
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.INGREDIENT_METADATA_REFRESH]: {
    pattern: '0 */6 * * *',
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.INGREDIENT_PROCESSING_RECONCILE]: {
    pattern: '0 * * * *',
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.LLM_IDLE_SHUTDOWN]: {
    pattern: '*/5 * * * *',
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.MODEL_DEPRECATION]: {
    pattern: '0 3 * * 0',
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.NOTIFICATION_DELIVERY_RECOVERY]: {
    pattern: '* * * * *',
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.PATTERN_EXTRACTION]: {
    pattern: '0 2 * * *',
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.POSTS_PUBLISH]: {
    pattern: '*/15 * * * *',
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.QUEUE_METRICS_PUBLISH]: {
    pattern: '*/5 * * * *',
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.RAW_CUT_CLIP_RECONCILE]: {
    pattern: '* * * * *',
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.REFERRAL_REWARD_SETTLEMENT]: {
    pattern: '*/5 * * * *',
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.REPLICATE_MODEL_DISCOVERY]: {
    pattern: '0 6 * * 0',
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.REVIEW_GATE_TIMEOUT]: {
    pattern: '*/15 * * * *',
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.RSS_AUTOPOST]: {
    pattern: '*/15 * * * *',
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.STREAK_MAINTENANCE]: {
    pattern: '30 0 * * *',
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.TIKTOK_STATUS]: {
    pattern: '*/5 * * * *',
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.TRANSCRIPT_PURGE]: {
    pattern: TRANSCRIPT_PURGE_SCHEDULE,
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.WORKFLOW_ARTIFACT_CLEANUP]: {
    pattern: '17 * * * *',
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.WORKFLOW_CONTINUATION_RECONCILE]: {
    pattern: '* * * * *',
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.YOUTUBE_MESSAGES]: {
    pattern: '*/30 * * * *',
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.YOUTUBE_STATUS]: {
    pattern: '0 1 * * *',
    timezone: 'UTC',
  },
} satisfies Record<PlatformScheduledTaskName, PlatformSchedule>;

export const RETIRED_SYSTEM_SWEEP_SCHEDULER_IDS = new Set([
  'batch-credit-settlement-reconcile-sweep',
  'batch-generation-reconcile-sweep',
  'engagement-triggers-sweep',
  'posts-publish-sweep',
  'review-gate-timeout-sweep',
  'rss-autopost-sweep',
  'streak-maintenance-sweep',
  'tiktok-status-sweep',
  'transcript-purge-sweep',
  'workflow-artifact-cleanup-sweep',
  'workflow-continuation-reconcile-sweep',
  'youtube-messages-sweep',
  'youtube-status-sweep',
]);

export function platformSchedulerId(
  taskName: PlatformScheduledTaskName,
): string {
  return `platform:${taskName}`;
}

export function isPlatformScheduledTaskName(
  value: string,
): value is PlatformScheduledTaskName {
  return Object.hasOwn(PLATFORM_SCHEDULE_CATALOG, value);
}
