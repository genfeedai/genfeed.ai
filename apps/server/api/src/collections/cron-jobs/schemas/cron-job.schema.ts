import type { CronJob as PrismaCronJob } from '@genfeedai/prisma';

export type { CronJob as PrismaCronJob } from '@genfeedai/prisma';

export const CRON_JOB_TYPES = [
  'workflow_execution',
  'agent_strategy_execution',
  'newsletter_substack',
] as const;

export type CronJobType = (typeof CRON_JOB_TYPES)[number];

export type CronJobLastStatus = 'failed' | 'never' | 'running' | 'success';

export interface CronJobDocument extends Omit<PrismaCronJob, 'config'> {
  _id: string;
  config?: Record<string, unknown>;
  consecutiveFailures: number;
  enabled: boolean;
  jobType: CronJobType;
  lastStatus: CronJobLastStatus;
  name: string;
  organization: string;
  payload: Record<string, unknown>;
  schedule: string;
  timezone: string;
  user: string;
  [key: string]: unknown;
}
