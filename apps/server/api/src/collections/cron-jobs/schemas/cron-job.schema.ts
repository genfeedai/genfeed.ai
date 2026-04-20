export type { CronJob as CronJobDocument } from '@genfeedai/prisma';

export const CRON_JOB_TYPES = [
  'workflow_execution',
  'agent_strategy_execution',
  'newsletter_substack',
] as const;

export type CronJobType = (typeof CRON_JOB_TYPES)[number];
