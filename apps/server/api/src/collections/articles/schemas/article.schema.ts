import type { ArticleCategory, ArticleScope } from '@genfeedai/enums';
import type { Article as PrismaArticle } from '@genfeedai/prisma';

export interface ArticleViralityAnalysis {
  score: number;
  factors: Record<string, number>;
  predictions?: Record<string, number>;
  suggestions: string[];
  analyzedAt?: Date | string;
}

export interface ArticleDocument extends PrismaArticle {
  _id: string;
  brand?: string | null;
  organization?: string | null;
  user?: string | null;
  label?: string | null;
  summary?: string | null;
  category?: ArticleCategory | string | null;
  content: PrismaArticle['content'];
  scope?: ArticleScope | string | null;
  tags?: string[] | null;
  viralityAnalysis?: ArticleViralityAnalysis | null;
  [key: string]: unknown;
}

export type Article = ArticleDocument;
