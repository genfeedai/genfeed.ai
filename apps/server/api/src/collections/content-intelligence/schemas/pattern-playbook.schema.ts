import type { ContentIntelligencePlatform } from '@genfeedai/enums';
import type { PatternPlaybook as PrismaPatternPlaybook } from '@genfeedai/prisma';

export type { PatternPlaybook as PrismaPatternPlaybook } from '@genfeedai/prisma';

export interface PatternPlaybookInsights {
  benchmarks?: Record<string, number>;
  contentMix?: Record<string, number>;
  hashtagStrategy?: Record<string, number | string[]>;
  postingSchedule?: Record<string, unknown>;
  topHooks?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface PatternPlaybookDocument
  extends Omit<PrismaPatternPlaybook, 'data'> {
  _id: string;
  createdBy?: string | null;
  data?: Record<string, unknown>;
  description?: string;
  insights?: PatternPlaybookInsights;
  isActive?: boolean;
  lastUpdatedAt?: Date | string | null;
  name?: string;
  niche?: string;
  organization: string;
  patternsCount?: number;
  platform?: ContentIntelligencePlatform | 'all';
  sourceCreators: string[];
  [key: string]: unknown;
}

export type PatternPlaybook = PatternPlaybookDocument;
