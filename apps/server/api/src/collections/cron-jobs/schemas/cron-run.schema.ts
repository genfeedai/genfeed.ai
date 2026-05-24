import type { CronRun as PrismaCronRun } from '@genfeedai/prisma';

export type { CronRun as PrismaCronRun } from '@genfeedai/prisma';

export type CronRunTrigger = 'manual' | 'scheduled';

export interface CronRunDocument extends Omit<PrismaCronRun, 'result'> {
  _id: string;
  artifacts?: Record<string, unknown>;
  organization: string;
  result?: Record<string, unknown>;
  trigger?: CronRunTrigger;
  user: string;
  [key: string]: unknown;
}
