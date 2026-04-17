import type { Article } from '@api/collections/articles/schemas/article.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import type {
  ArticleCategory,
  ArticleScope,
  ArticleStatus,
} from '@genfeedai/enums';

export class ArticleEntity extends BaseEntity implements Article {
  user!: string;
  organization!: string;
  brand!: string;
  banner?: string;
  tags!: string[];

  label!: string;
  description?: string;

  slug!: string;
  summary!: string;
  content!: string;
  category!: ArticleCategory;
  status!: ArticleStatus;
  scope!: ArticleScope;

  publishedAt?: Date;

  // AI Generation metadata
  aiGeneration?: {
    threadId?: string;
    runId?: string;
    prompt?: string;
    startedAt?: Date;
    completedAt?: Date;
    error?: string;
  };

  // Virality analysis
  viralityAnalysis?: {
    score: number;
    factors: {
      emotionalAppeal: number;
      shareability: number;
      readability: number;
      seoScore: number;
      trendAlignment: number;
    };
    predictions: {
      estimatedReach: number;
      estimatedShares: number;
      estimatedEngagement: number;
    };
    suggestions: string[];
    analyzedAt: Date;
  };

  // Performance metrics
  performanceMetrics?: {
    views: number;
    shares: number;
    likes: number;
    comments: number;
    engagementRate: number;
    clickThroughRate: number;
    lastUpdated: Date;
  };
}
