import type { ContentRunSource, ContentRunStatus } from '@genfeedai/enums';
import type {
  ContentRunAnalyticsSummary,
  ContentRunBrief,
  ContentRunPublishContext,
  ContentRunRecommendation,
  ContentRunVariant,
} from './content-run.interface';

export interface CreateContentRunInput {
  analyticsSummary?: ContentRunAnalyticsSummary;
  brand: string;
  brief?: ContentRunBrief;
  creditsUsed: number;
  input: Record<string, unknown>;
  organization: string;
  publish?: ContentRunPublishContext;
  recommendations?: ContentRunRecommendation[];
  skillSlug: string;
  source: ContentRunSource;
  status: ContentRunStatus;
  variants?: ContentRunVariant[];
}

export interface UpdateContentRunInput {
  analyticsSummary?: ContentRunAnalyticsSummary;
  brief?: ContentRunBrief;
  creditsUsed?: number;
  duration?: number;
  error?: string;
  output?: Record<string, unknown>;
  publish?: ContentRunPublishContext;
  recommendations?: ContentRunRecommendation[];
  source?: ContentRunSource;
  status?: ContentRunStatus;
  variants?: ContentRunVariant[];
}
