import { TRANSCRIPT_PURGE_SCHEDULE } from '@workers/crons/transcript-purge/transcript-purge.constants';

/**
 * System sweep scheduling manifest.
 *
 * Tenant-product recurring automation fires from BullMQ Job Schedulers on
 * this queue instead of static @Cron decorators (issue #1092). BullMQ
 * guarantees exactly-one fire per scheduler id across worker replicas, and
 * each sweep records tenant-visible provenance through
 * hidden system workflows.
 */

export const SYSTEM_SWEEPS_QUEUE = 'system-sweeps';

export const SYSTEM_SWEEP_JOBS = {
  AGENT_TURN_RECONCILE: 'agent-turn-reconcile-sweep',
  BATCH_CREDIT_SETTLEMENT_RECONCILE: 'batch-credit-settlement-reconcile-sweep',
  BATCH_GENERATION_RECONCILE: 'batch-generation-reconcile-sweep',
  ENGAGEMENT_TRIGGERS: 'engagement-triggers-sweep',
  POSTS_PUBLISH: 'posts-publish-sweep',
  REVIEW_GATE_TIMEOUT: 'review-gate-timeout-sweep',
  RSS_AUTOPOST: 'rss-autopost-sweep',
  STREAK_MAINTENANCE: 'streak-maintenance-sweep',
  TIKTOK_STATUS: 'tiktok-status-sweep',
  TRANSCRIPT_PURGE: 'transcript-purge-sweep',
  YOUTUBE_MESSAGES: 'youtube-messages-sweep',
  YOUTUBE_STATUS: 'youtube-status-sweep',
} as const;

export type SystemSweepJobName =
  (typeof SYSTEM_SWEEP_JOBS)[keyof typeof SYSTEM_SWEEP_JOBS];

export type SystemSweepDefinition = {
  jobName: SystemSweepJobName;
  pattern: string;
  timezone: string;
};

export const SYSTEM_SWEEP_DEFINITIONS: SystemSweepDefinition[] = [
  {
    // Accepted turns carry an encrypted durable queue payload. A deterministic
    // BullMQ job id makes this safe beside a live or already queued job.
    jobName: SYSTEM_SWEEP_JOBS.AGENT_TURN_RECONCILE,
    pattern: '*/5 * * * *',
    timezone: 'UTC',
  },
  {
    jobName: SYSTEM_SWEEP_JOBS.POSTS_PUBLISH,
    pattern: '*/15 * * * *',
    timezone: 'UTC',
  },
  {
    jobName: SYSTEM_SWEEP_JOBS.RSS_AUTOPOST,
    pattern: '*/15 * * * *',
    timezone: 'UTC',
  },
  {
    jobName: SYSTEM_SWEEP_JOBS.ENGAGEMENT_TRIGGERS,
    pattern: '*/15 * * * *',
    timezone: 'UTC',
  },
  {
    jobName: SYSTEM_SWEEP_JOBS.TIKTOK_STATUS,
    pattern: '*/5 * * * *',
    timezone: 'UTC',
  },
  {
    jobName: SYSTEM_SWEEP_JOBS.YOUTUBE_STATUS,
    pattern: '0 1 * * *',
    timezone: 'UTC',
  },
  {
    jobName: SYSTEM_SWEEP_JOBS.YOUTUBE_MESSAGES,
    pattern: '*/30 * * * *',
    timezone: 'UTC',
  },
  {
    jobName: SYSTEM_SWEEP_JOBS.STREAK_MAINTENANCE,
    pattern: '30 0 * * *',
    timezone: 'UTC',
  },
  {
    jobName: SYSTEM_SWEEP_JOBS.REVIEW_GATE_TIMEOUT,
    pattern: '*/15 * * * *',
    timezone: 'UTC',
  },
  {
    // A settlement shortfall is durable and retry-safe, so collection can run
    // frequently and becomes a no-op until the organization balance recovers.
    jobName: SYSTEM_SWEEP_JOBS.BATCH_CREDIT_SETTLEMENT_RECONCILE,
    pattern: '*/5 * * * *',
    timezone: 'UTC',
  },
  {
    // Batch runs are re-claimed after a 5-minute stale lease, so sweeping on
    // the same cadence keeps a batch orphaned by a lost job down to minutes
    // instead of forever.
    jobName: SYSTEM_SWEEP_JOBS.BATCH_GENERATION_RECONCILE,
    pattern: '*/5 * * * *',
    timezone: 'UTC',
  },
  {
    // Soft-deleted agent transcripts keep prompt text until this daily wipe
    // (30-day retention). Live threads are never touched (#3030).
    jobName: SYSTEM_SWEEP_JOBS.TRANSCRIPT_PURGE,
    pattern: TRANSCRIPT_PURGE_SCHEDULE,
    timezone: 'UTC',
  },
];
