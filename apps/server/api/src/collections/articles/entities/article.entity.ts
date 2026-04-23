import type { Article } from '@api/collections/articles/schemas/article.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';

export class ArticleEntity extends BaseEntity implements Article {
  id!: string;
  mongoId!: string | null;
  userId!: string;
  organizationId!: string;
  brandId!: string | null;
  title!: string;
  excerpt!: string | null;
  coverImageUrl!: string | null;
  user!: string;
  organization!: string;
  brand!: string;
  banner?: string;
  tags!: string[];

  label!: string;
  description!: string | null;

  slug!: string;
  summary!: string;
  content!: Article['content'];
  category!: Article['category'];
  status!: Article['status'];
  scope!: Article['scope'];

  publishedAt!: Article['publishedAt'];

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
