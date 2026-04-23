import type { ContextBase as PrismaContextBase } from '@genfeedai/prisma';

export type { ContextBase as PrismaContextBase } from '@genfeedai/prisma';

export interface ContextBase extends PrismaContextBase {
  _id: string;
  category?: string;
  createdBy?: string | null;
  description?: string;
  entryCount?: number;
  isActive?: boolean;
  label?: string;
  lastAnalyzed?: Date | string | null;
  organization?: string;
  source?: string;
  sourceBrand?: string | null;
  sourceUrl?: string;
  type?: string;
  usageCount?: number;
  [key: string]: unknown;
}

export type ContextBaseDocument = ContextBase;
