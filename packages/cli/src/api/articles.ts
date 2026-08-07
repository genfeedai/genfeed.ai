import { get, post } from './client';
import {
  flattenCollection,
  flattenSingle,
  type JsonApiCollectionResponse,
  type JsonApiSingleResponse,
} from './json-api';

/** Mirrors `ArticleStatus` in `@genfeedai/enums`. */
export type ArticleStatus = 'draft' | 'processing' | 'public' | 'archived' | 'failed';

/** Mirrors `ArticleGenerationType` in the API's `GenerateArticlesDto`. */
export type ArticleGenerationType = 'standard' | 'x-article';

/**
 * Article resource as emitted by the API's `ArticleSerializer`.
 *
 * Attribute names follow the serializer, not the database columns: the headline
 * is `label` (not `title`), and word counts only exist on X articles, under
 * `xArticleMetadata`.
 */
export interface XArticleMetadata {
  estimatedReadTime?: number;
  wordCount?: number;
}

export interface Article {
  id: string;
  status: ArticleStatus;
  label?: string;
  slug?: string;
  summary?: string;
  content?: string;
  category?: string;
  bannerUrl?: string;
  publishedAt?: string;
  xArticleMetadata?: XArticleMetadata;
  createdAt: string;
  updatedAt: string;
}

/**
 * Body accepted by `POST /articles/generations` for `type: 'standard'`.
 * Mirrors the whitelisted fields on `GenerateArticlesDto`; anything else is
 * stripped by the API's validation pipe. The brand and organization come from
 * the API key's own context — they are not client-supplied.
 */
export interface GenerateArticlesRequest {
  prompt: string;
  count?: number;
  category?: string;
  keywords?: string[];
}

/** Body accepted by `POST /articles/generations` for `type: 'x-article'`. */
export interface GenerateXArticleRequest {
  prompt: string;
  keywords?: string[];
  tone?: string;
  targetWordCount?: number;
  generateHeaderImage?: boolean;
}

const GENERATIONS_PATH = '/articles/generations';

/**
 * Generate one or more standard articles.
 *
 * The route runs the full generation cycle inline and answers with a JSON:API
 * *collection* of finished articles, so there is nothing to poll afterwards.
 */
export async function generateArticles(request: GenerateArticlesRequest): Promise<Article[]> {
  const response = await post<JsonApiCollectionResponse>(GENERATIONS_PATH, {
    ...request,
    type: 'standard' satisfies ArticleGenerationType,
  });
  return flattenCollection<Article>(response);
}

/**
 * Generate a single long-form X article.
 *
 * Same route as {@link generateArticles}, but `type: 'x-article'` makes the API
 * answer with a JSON:API *single* resource rather than a collection.
 */
export async function generateXArticle(request: GenerateXArticleRequest): Promise<Article> {
  const response = await post<JsonApiSingleResponse>(GENERATIONS_PATH, {
    ...request,
    type: 'x-article' satisfies ArticleGenerationType,
  });
  return flattenSingle<Article>(response);
}

export async function getArticle(id: string): Promise<Article> {
  const response = await get<JsonApiSingleResponse>(`/articles/${id}`);
  return flattenSingle<Article>(response);
}
