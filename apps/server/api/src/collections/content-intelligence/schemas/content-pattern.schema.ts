import type {
  ContentIntelligencePlatform,
  ContentPatternType,
  TemplateCategory,
} from '@genfeedai/enums';
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
  _id: string;
  data?: Record<string, unknown>;
  description?: string;
  embedding?: number[];
  extractedFormula?: string;
  organization: string;
  patternType?: ContentPatternType;
  placeholders?: string[];
  platform?: ContentIntelligencePlatform;
  rawExample?: string;
  relevanceWeight?: number;
  sourceCreator?: string | null;
  sourceMetrics?: ContentPatternSourceMetrics;
  sourcePostDate?: Date | string | null;
  sourcePostId?: string | null;
  sourcePostUrl?: string | null;
  tags?: string[];
  templateCategory?: TemplateCategory;
  usageCount?: number;
  [key: string]: unknown;
}

export type ContentPattern = ContentPatternDocument;
