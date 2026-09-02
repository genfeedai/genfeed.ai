import type { ArticleCategory, ArticleScope } from '@genfeedai/contracts';
import type { Article as PrismaArticle } from '@genfeedai/prisma';

export interface ArticleViralityAnalysis {
  score: number;
  factors: Record<string, number>;
  predictions?: Record<string, number>;
  suggestions: string[];
  analyzedAt?: Date | string;
}

export interface ArticleDocument
  extends Omit<PrismaArticle, 'category' | 'scope'> {
  // `label` and `summary` are real Prisma columns since #2767 — they are
  // inherited from PrismaArticle and must never be redeclared here as optional
  // aliases (see .agents/memory/rules/prisma_legacy_alias_fields.md).
  category?: ArticleCategory | string | null;
  content: PrismaArticle['content'];
  scope?: ArticleScope | string | null;
  viralityAnalysis?: ArticleViralityAnalysis | null;
  [key: string]: unknown;
}

export type Article = ArticleDocument;
