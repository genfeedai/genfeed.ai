import { ArticleCategory, ArticleStatus, AssetScope } from '@genfeedai/enums';
import type {
  IAsset,
  IBaseEntity,
  IBrand,
  IEvaluation,
  IOrganization,
  ITag,
  IUser,
} from '../index';
import type { IXArticleMetadata } from './x-article-metadata.interface';

export interface IArticle extends IBaseEntity {
  user: IUser;
  organization: IOrganization;
  brand?: IBrand;
  tags?: ITag[];
  banner?: IAsset;
  label: string;
  slug: string;
  summary: string;
  content: string;
  category: ArticleCategory;
  status: ArticleStatus;
  publishedAt?: string;
  author?: string;
  readingTime?: number;
  wordCount?: number;
  scope: AssetScope;
  generationPrompt?: string;
  bannerUrl?: string;
  evaluation?: IEvaluation | null;
  xArticleMetadata?: IXArticleMetadata;
}

export interface IArticleCreateInput {
  label: string;
  slug?: string;
  summary: string;
  content: string;
  category?: ArticleCategory;
  status?: ArticleStatus;
  tags?: ITag[];
  readingTime?: number;
  wordCount?: number;
  scope?: AssetScope;
  banner?: string; // Asset ID
  generationPrompt?: string;
}

export interface IArticleUpdateInput extends Partial<IArticleCreateInput> {
  id: string;
}

/**
 * AI-generated article data structure
 */
export interface GeneratedArticleData {
  content?: string;
  label?: string;
  title?: string;
  slug?: string;
  summary?: string;
  tags?: string[];
  sections?: Array<{
    heading: string;
    content: string;
    pullQuote?: string;
  }>;
}

/**
 * Response from AI article generation API
 * Supports both single and multiple article formats
 */
export interface ArticleGenerationResponse {
  articles?: GeneratedArticleData[];
  // Support single article format
  content?: string;
  label?: string;
  title?: string;
  slug?: string;
  summary?: string;
  tags?: string[];
  sections?: Array<{
    heading: string;
    content: string;
    pullQuote?: string;
  }>;
}

/**
 * Payload for creating an article from AI generation
 */
export interface ArticleCreatePayload {
  aiGeneration: {
    completedAt: Date;
    prompt: string;
    startedAt: Date;
  };
  category: ArticleCategory;
  content: string;
  label: string;
  slug: string;
  status: ArticleStatus;
  summary: string;
  tags: string[];
  xArticleMetadata?: {
    wordCount: number;
    estimatedReadTime: number;
    sections: Array<{
      id: string;
      heading: string;
      content: string;
      order: number;
      pullQuote?: string;
    }>;
  };
}
