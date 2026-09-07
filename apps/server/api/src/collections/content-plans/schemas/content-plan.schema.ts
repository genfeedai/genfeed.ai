import type { ContentPlanStatus } from '@genfeedai/contracts';
import type { ContentPlan as PrismaContentPlan } from '@genfeedai/prisma';

export type { ContentPlan as PrismaContentPlan } from '@genfeedai/prisma';

/** Effective cold-start seeds a plan was generated from (#4511 Lane F). */
export interface ContentPlanSeedsRecord {
  advertiserIds: string[];
  sourceIds: string[];
  isColdStart: boolean;
  isImportedHistoryIncluded: boolean;
  isPatternsIncluded: boolean;
}

export interface ContentPlanConfig {
  description?: string | null;
  executedCount?: number;
  itemCount?: number;
  name?: string | null;
  periodEnd?: Date | string | null;
  periodStart?: Date | string | null;
  seeds?: ContentPlanSeedsRecord | null;
  status?: ContentPlanStatus;
  [key: string]: unknown;
}

export interface ContentPlanDocument
  extends Omit<PrismaContentPlan, 'config' | 'executedCount'>,
    ContentPlanConfig {
  config?: Record<string, unknown>;
  [key: string]: unknown;
}

export type ContentPlan = ContentPlanDocument;
