import { PROVIDER_PRICE_SYNC_TASKS } from '@genfeedai/contracts/queue';
import { BRANDED_DISPATCH_RECOVERY_SCHEDULE } from '@workers/crons/branded-dispatch-recovery/branded-dispatch-recovery.constants';
import { FREE_TRIAL_EXPIRY_SCHEDULE } from '@workers/crons/credits/free-trial-expiry.constants';
import { MEDIA_PERCEPTION_SWEEP_SCHEDULE } from '@workers/crons/media-perception/media-perception.constants';
import { OAUTH_CLIENT_CLEANUP_SCHEDULE } from '@workers/crons/oauth-client-cleanup/oauth-client-cleanup.constants';
import { TRANSCRIPT_PURGE_SCHEDULE } from '@workers/crons/transcript-purge/transcript-purge.constants';
import { X_REPLY_WATCH_SCHEDULE } from '@workers/crons/x-replies/x-reply-watch.constants';

/**
 * One code-owned catalog for deployment-global recurring work.
 *
 * Customer-owned schedules remain database-backed Workflow records and fire on
 * the workflow-execution queue. Platform schedules are reviewed code and fire
 * on this dedicated queue. Both domains use BullMQ Job Schedulers; neither may
 * use process-local Nest timers.
 *
 * The queue name (`PLATFORM_SCHEDULE_QUEUE`) lives in `@genfeedai/contracts/queue`
 * as a wire-level contract shared with the API.
 */
export const PLATFORM_SCHEDULED_TASKS = {
  BRAND_RELOCATION_RECOVERY: 'brand-relocation-recovery',
  PROACTIVE_AGENT_STRATEGIES: 'proactive-agent-strategies',
  ANALYTICS_SYNC: 'analytics-sync',
  BRANDED_DISPATCH_RECOVERY: 'branded-dispatch-recovery',
  CONTENT_LEARNING_RECONCILE: 'content-learning-reconcile',
  CONTENT_LEARNING_RETENTION: 'content-learning-retention',
  CONTENT_LOOP_AUTOPILOT: 'content-loop-autopilot',
  TURBO_RUN_CREDIT_SETTLEMENT_RECONCILE:
    'turbo-run-credit-settlement-reconcile',
  TURBO_RUN_RECONCILE: 'turbo-run-reconcile',
  TURBO_PROJECT_RECONCILE: 'turbo-project-reconcile',
  CREDENTIAL_TOKEN_REFRESH: 'credential-token-refresh',
  CRUN_TASK_RECONCILE: 'crun-task-reconcile',
  CRUN_CONTRACT_SYNC: 'crun-contract-sync',
  EDITOR_RENDER_RECONCILE: 'editor-render-reconcile',
  ENGAGEMENT_TRIGGERS: 'engagement-triggers',
  FAL_MODEL_DISCOVERY: PROVIDER_PRICE_SYNC_TASKS.fal,
  FREE_TRIAL_EXPIRY: 'free-trial-expiry',
  GLOBAL_TRENDS_REFRESH: 'global-trends-refresh',
  INGREDIENT_METADATA_REFRESH: 'ingredient-metadata-refresh',
  INGREDIENT_PROCESSING_RECONCILE: 'ingredient-processing-reconcile',
  LIFECYCLE_EMAILS: 'lifecycle-emails',
  LLM_IDLE_SHUTDOWN: 'llm-idle-shutdown',
  MEDIA_PERCEPTION_SWEEP: 'media-perception-sweep',
  MODEL_DEPRECATION: 'model-deprecation',
  NOTIFICATION_DELIVERY_RECOVERY: 'notification-delivery-recovery',
  OAUTH_CLIENT_CLEANUP: 'oauth-client-cleanup',
  PATTERN_EXTRACTION: 'pattern-extraction',
  PENDING_WORKFLOW_EXECUTION_RECONCILE: 'pending-workflow-execution-reconcile',
  POSTS_PUBLISH: 'posts-publish',
  POSTS_THREAD_COMMENTS: 'posts-thread-comments',
  QUEUE_METRICS_PUBLISH: 'queue-metrics-publish',
  RAW_CUT_CLIP_RECONCILE: 'raw-cut-clip-reconcile',
  REFERRAL_REWARD_SETTLEMENT: 'referral-reward-settlement',
  REPLICATE_MODEL_DISCOVERY: PROVIDER_PRICE_SYNC_TASKS.replicate,
  REVIEW_GATE_TIMEOUT: 'review-gate-timeout',
  RSS_AUTOPOST: 'rss-autopost',
  SOCIAL_SOURCE_OWN_ACCOUNT_RESYNC: 'social-source-own-account-resync',
  STREAK_MAINTENANCE: 'streak-maintenance',
  TIKTOK_STATUS: 'tiktok-status',
  TRANSCRIPT_PURGE: 'transcript-purge',
  WORKFLOW_ARTIFACT_CLEANUP: 'workflow-artifact-cleanup',
  WORKFLOW_CONTINUATION_RECONCILE: 'workflow-continuation-reconcile',
  WORKSPACE_TASK_ROLLUP_RECOVERY: 'workspace-task-rollup-recovery',
  X_REPLY_WATCH: 'x-reply-watch',
  EXTERNAL_VOICE_CATALOG_SYNC: 'external-voice-catalog-sync',
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
  [PLATFORM_SCHEDULED_TASKS.BRAND_RELOCATION_RECOVERY]: {
    pattern: '* * * * *',
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.CRUN_TASK_RECONCILE]: {
    pattern: '*/30 * * * * *',
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.CRUN_CONTRACT_SYNC]: {
    pattern: '10 3 * * *',
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.CONTENT_LEARNING_RECONCILE]: {
    pattern: '*/5 * * * *',
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.CONTENT_LEARNING_RETENTION]: {
    pattern: '20 3 * * *',
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.PROACTIVE_AGENT_STRATEGIES]: {
    pattern: '* * * * *',
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.ANALYTICS_SYNC]: {
    pattern: '0 */6 * * *',
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.CONTENT_LOOP_AUTOPILOT]: {
    pattern: '0 8 * * *',
    timezone: 'UTC',
  },
  // Finds the organizations with lifecycle deliveries, recaps, credit or trial
  // notices, or product signals due, and queues one run for each. Idle
  // organizations get none.
  [PLATFORM_SCHEDULED_TASKS.LIFECYCLE_EMAILS]: {
    pattern: '0 * * * *',
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.TURBO_RUN_CREDIT_SETTLEMENT_RECONCILE]: {
    pattern: '*/5 * * * *',
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.TURBO_RUN_RECONCILE]: {
    pattern: '*/5 * * * *',
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.TURBO_PROJECT_RECONCILE]: {
    pattern: '* * * * *',
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
  // Provider prices change rarely; a weekly refresh is inside the 10-day
  // staleness window (`MODEL_PRICING_REFRESH_STALE_DAYS`).
  [PLATFORM_SCHEDULED_TASKS.FAL_MODEL_DISCOVERY]: {
    pattern: '0 7 * * 0',
    timezone: 'UTC',
  },
  // Admission already refuses an expired trial; this only removes the
  // leftover free credits, so a 15-minute cadence is enough.
  [PLATFORM_SCHEDULED_TASKS.FREE_TRIAL_EXPIRY]: {
    pattern: FREE_TRIAL_EXPIRY_SCHEDULE,
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
  [PLATFORM_SCHEDULED_TASKS.MEDIA_PERCEPTION_SWEEP]: {
    pattern: MEDIA_PERCEPTION_SWEEP_SCHEDULE,
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
  [PLATFORM_SCHEDULED_TASKS.BRANDED_DISPATCH_RECOVERY]: {
    pattern: BRANDED_DISPATCH_RECOVERY_SCHEDULE,
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.OAUTH_CLIENT_CLEANUP]: {
    pattern: OAUTH_CLIENT_CLEANUP_SCHEDULE,
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.PATTERN_EXTRACTION]: {
    pattern: '0 2 * * *',
    timezone: 'UTC',
  },
  // Bounded-failure backstop for a `PENDING` system-workflow run no worker
  // ever claimed — see #5162. This is a global reconcile, not a per-org
  // dispatch: it scans for stuck rows, it does not enqueue one per org.
  [PLATFORM_SCHEDULED_TASKS.PENDING_WORKFLOW_EXECUTION_RECONCILE]: {
    pattern: '* * * * *',
    timezone: 'UTC',
  },
  // The sweep only finds due posts and enqueues one job each (the publish runs
  // on the background queue), so a per-minute tick is one indexed query.
  [PLATFORM_SCHEDULED_TASKS.POSTS_PUBLISH]: {
    pattern: '* * * * *',
    timezone: 'UTC',
  },
  // A creator can park a comment one minute behind its post, so this sweep
  // runs far more often than the publish sweep it follows.
  [PLATFORM_SCHEDULED_TASKS.POSTS_THREAD_COMMENTS]: {
    pattern: '* * * * *',
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
  // Weekly, an hour before fal (see FAL_MODEL_DISCOVERY).
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
  [PLATFORM_SCHEDULED_TASKS.SOCIAL_SOURCE_OWN_ACCOUNT_RESYNC]: {
    pattern: '0 * * * *',
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
  // Durable backstop for workspace-task rollups whose terminal event was lost
  // or whose lease holder failed; the 10-minute lease is the retry backoff.
  [PLATFORM_SCHEDULED_TASKS.WORKSPACE_TASK_ROLLUP_RECOVERY]: {
    pattern: '*/2 * * * *',
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.X_REPLY_WATCH]: {
    pattern: X_REPLY_WATCH_SCHEDULE,
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.EXTERNAL_VOICE_CATALOG_SYNC]: {
    pattern: '0 */12 * * *',
    timezone: 'UTC',
  },
  [PLATFORM_SCHEDULED_TASKS.YOUTUBE_MESSAGES]: {
    pattern: '0 * * * *',
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
