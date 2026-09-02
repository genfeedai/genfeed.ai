import type { ArticleCategory, ArticleStatus, AssetScope } from '../..';
import type {
  IBaseEntity,
  IBrand,
  IEvaluation,
  IOrganization,
  ITag,
  IUser,
} from '../index';
import type { SeoScorecardSnapshot } from './seo-scorecard.interface';
import type { IXArticleMetadata } from './x-article-metadata.interface';

export interface IArticle extends IBaseEntity {
  user: IUser;
  organization: IOrganization;
  brand?: IBrand;
  tags?: ITag[];
  /** Persisted cover image (`articles.coverImageUrl`). */
  coverImageUrl?: string;
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
  evaluation?: IEvaluation | null;
  seoScore?: number | null;
  seoBreakdown?: SeoScorecardSnapshot | null;
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
  coverImageUrl?: string;
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
 * Payload for creating an article from AI generation.
 * Keys must be persistable Article scalars — `aiGeneration` and
 * `xArticleMetadata` are not Article columns (#2859).
 */
export interface ArticleCreatePayload {
  category: ArticleCategory;
  content: string;
  label: string;
  slug: string;
  status: ArticleStatus;
  summary: string;
  /** Resolved Tag ids (not labels) — connected via the `article_tags` relation. */
  tags?: string[];
}
