import type { ContentPlanStatus } from '@genfeedai/enums';
import type { ContentPlan as PrismaContentPlan } from '@genfeedai/prisma';

export type { ContentPlan as PrismaContentPlan } from '@genfeedai/prisma';

export interface ContentPlanConfig {
  description?: string | null;
  executedCount?: number;
  itemCount?: number;
  name?: string | null;
  periodEnd?: Date | string | null;
  periodStart?: Date | string | null;
  status?: ContentPlanStatus;
  [key: string]: unknown;
}

export interface ContentPlanDocument
  extends Omit<PrismaContentPlan, 'config'>,
    ContentPlanConfig {
  _id: string;
  brand?: string | null;
  config?: Record<string, unknown>;
  createdBy?: string | null;
  organization: string;
  [key: string]: unknown;
}

export type ContentPlan = ContentPlanDocument;
