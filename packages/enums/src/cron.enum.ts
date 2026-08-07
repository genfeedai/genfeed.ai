/**
 * Cron job lifecycle. Values match Prisma `CronJobStatus` exactly.
 *
 * `cron_jobs.status` is a Postgres enum column, so these are Prisma labels —
 * never a lowercase product vocabulary.
 *
 * @see packages/prisma/prisma/schema.prisma `enum CronJobStatus`
 * @see .agents/memory/rules/enum_source_of_truth.md
 */
export const CronJobStatus = {
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

export type CronJobStatus = (typeof CronJobStatus)[keyof typeof CronJobStatus];

/**
 * Single cron execution lifecycle. Values match Prisma `CronRunStatus` exactly.
 *
 * @see packages/prisma/prisma/schema.prisma `enum CronRunStatus`
 */
export const CronRunStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

export type CronRunStatus = (typeof CronRunStatus)[keyof typeof CronRunStatus];
