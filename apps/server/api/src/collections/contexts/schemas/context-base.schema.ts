import type { ContextBase as PrismaContextBase } from '@genfeedai/prisma';

export type { ContextBase as PrismaContextBase } from '@genfeedai/prisma';

export interface ContextBase extends PrismaContextBase {
  category?: string;
  createdBy?: string | null;
  description?: string;
  entryCount?: number;
  isActive?: boolean;
  label?: string;
  lastAnalyzed?: Date | string | null;
  purpose?: string;
  source?: string;
  sourceBrand?: string | null;
  sourceUrl?: string;
  sources?: unknown[];
  type?: string;
  usageCount?: number;
  [key: string]: unknown;
}

export type ContextBaseDocument = ContextBase;
