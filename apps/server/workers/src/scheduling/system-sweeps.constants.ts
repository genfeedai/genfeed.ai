/**
 * System sweep scheduling manifest.
 *
 * Tenant-product recurring automation fires from BullMQ Job Schedulers on
 * this queue instead of static @Cron decorators (issue #1092). BullMQ
 * guarantees exactly-one fire per scheduler id across worker replicas, and
 * each sweep records tenant-visible provenance through
 * SystemWorkflowProvenanceService.
 */

export const SYSTEM_SWEEPS_QUEUE = 'system-sweeps';

export const SYSTEM_SWEEP_JOBS = {
  POSTS_PUBLISH: 'posts-publish-sweep',
  STREAK_MAINTENANCE: 'streak-maintenance-sweep',
  TIKTOK_STATUS: 'tiktok-status-sweep',
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
    jobName: SYSTEM_SWEEP_JOBS.POSTS_PUBLISH,
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
    jobName: SYSTEM_SWEEP_JOBS.STREAK_MAINTENANCE,
    pattern: '30 0 * * *',
    timezone: 'UTC',
  },
];
