import type { CronRun as PrismaCronRun } from '@genfeedai/prisma';

export type { CronRun as PrismaCronRun } from '@genfeedai/prisma';

export type CronRunTrigger = 'manual' | 'scheduled';

export interface CronRunDocument extends Omit<PrismaCronRun, 'result'> {
  artifacts?: Record<string, unknown>;
  result?: Record<string, unknown>;
  trigger?: CronRunTrigger;
  [key: string]: unknown;
}
