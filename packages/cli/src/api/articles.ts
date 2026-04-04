import { get, post } from './client.js';
import { flattenSingle, type JsonApiSingleResponse } from './json-api.js';

export type ArticleStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Article {
  id: string;
  status: ArticleStatus;
  title?: string;
  summary?: string;
  content?: string;
  wordCount?: number;
  category?: string;
  model?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface CreateArticleRequest {
  prompt: string;
  brand: string;
  count?: number;
  category?: string;
}

export interface CreateXArticleRequest {
  prompt: string;
  brand: string;
}

export interface ArticleActivity {
  id: string;
  status: ArticleStatus;
  articleId?: string;
}

export async function generateArticle(request: CreateArticleRequest): Promise<ArticleActivity> {
  const response = await post<JsonApiSingleResponse>(
    '/articles/generate',
    request as unknown as Record<string, unknown>
  );
  return flattenSingle<ArticleActivity>(response);
}

export async function generateXArticle(request: CreateXArticleRequest): Promise<ArticleActivity> {
  const response = await post<JsonApiSingleResponse>(
    '/articles/generate-x-article',
    request as unknown as Record<string, unknown>
  );
  return flattenSingle<ArticleActivity>(response);
}

export async function getArticle(id: string): Promise<Article> {
  const response = await get<JsonApiSingleResponse>(`/articles/${id}`);
  return flattenSingle<Article>(response);
}
