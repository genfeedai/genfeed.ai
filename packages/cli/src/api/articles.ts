import type { PersistedArticleStatus } from '@genfeedai/contracts';
import { get, post } from './client';
import {
  flattenCollection,
  flattenSingle,
  type JsonApiCollectionResponse,
  type JsonApiSingleResponse,
} from './json-api';

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
  /**
   * `articles.status` is a Prisma enum, so a serialized article carries the
   * persisted vocabulary. The app-level `ArticleStatus` in `@genfeedai/contracts`
   * is the lowercase query/write vocabulary and never appears on a read.
   *
   * @see .agents/memory/rules/enum_source_of_truth.md
   */
  status: PersistedArticleStatus;
  label?: string;
  slug?: string;
  summary?: string;
  content?: string;
  category?: string;
  coverImageUrl?: string;
  publishedAt?: string;
  xArticleMetadata?: XArticleMetadata;
  createdAt: string;
  updatedAt: string;
}

/**
 * Body accepted by `POST /articles/generations` for `type: 'standard'`.
 * Mirrors the whitelisted fields on `GenerateArticlesDto`; anything else is
 * stripped by the API's validation pipe.
 */
export interface GenerateArticlesRequest {
  brandId: string;
  prompt: string;
  type: 'standard';
  count?: number;
  category?: string;
  keywords?: string[];
}

/** Body accepted by `POST /articles/generations` for `type: 'x-article'`. */
export interface GenerateXArticleRequest {
  brandId: string;
  prompt: string;
  type: 'x-article';
  keywords?: string[];
  tone?: string;
  targetWordCount?: number;
  generateHeaderImage?: boolean;
}

const GENERATIONS_PATH = '/articles/generations';

/**
 * Generate one or more standard articles, or one long-form X article.
 *
 * The route runs the full generation cycle inline and answers with a JSON:API
 * collection for standard articles and a single resource for X articles.
 */
export function generateArticle(
  request: GenerateArticlesRequest,
  signal?: AbortSignal
): Promise<Article[]>;
export function generateArticle(
  request: GenerateXArticleRequest,
  signal?: AbortSignal
): Promise<Article>;
export async function generateArticle(
  request: GenerateArticlesRequest | GenerateXArticleRequest,
  signal?: AbortSignal
): Promise<Article | Article[]> {
  const response = signal
    ? await post<JsonApiCollectionResponse | JsonApiSingleResponse>(
        GENERATIONS_PATH,
        { ...request },
        { signal }
      )
    : await post<JsonApiCollectionResponse | JsonApiSingleResponse>(GENERATIONS_PATH, {
        ...request,
      });

  return request.type === 'x-article'
    ? flattenSingle<Article>(response as JsonApiSingleResponse)
    : flattenCollection<Article>(response as JsonApiCollectionResponse);
}

export async function getArticle(id: string): Promise<Article> {
  const response = await get<JsonApiSingleResponse>(`/articles/${id}`);
  return flattenSingle<Article>(response);
}
