import type {
  ContentIntelligencePlatform,
  ContentPatternCategory,
  ContentPatternType,
} from '@genfeedai/contracts';
import type { ContentPattern as PrismaContentPattern } from '@genfeedai/prisma';

export type { ContentPattern as PrismaContentPattern } from '@genfeedai/prisma';

export interface ContentPatternSourceMetrics {
  comments?: number;
  engagementRate?: number;
  likes?: number;
  shares?: number;
  views?: number;
  viralScore?: number;
  [key: string]: unknown;
}

export interface ContentPatternDocument
  extends Omit<PrismaContentPattern, 'data'> {
  data?: Record<string, unknown>;
  description?: string;
  extractedFormula?: string;
  /** No confident source produced this pattern's labels (#4868). */
  isLowConfidence?: boolean;
  patternType?: ContentPatternType;
  placeholders?: string[];
  platform?: ContentIntelligencePlatform;
  rawExample?: string;
  relevanceWeight?: number;
  sourceMetrics?: ContentPatternSourceMetrics;
  sourcePostDate?: Date | string | null;
  sourcePostId?: string | null;
  sourcePostUrl?: string | null;
  tags?: string[];
  templateCategory?: ContentPatternCategory;
  usageCount?: number;
  [key: string]: unknown;
}

export type ContentPattern = ContentPatternDocument;
