import { del, get, post } from './client.js';
import {
  flattenCollection,
  flattenSingle,
  type JsonApiCollectionResponse,
  type JsonApiSingleResponse,
} from './json-api.js';

export interface Template {
  id: string;
  label: string;
  description?: string;
  purpose?: string;
  category?: string;
  content?: string;
  variables?: string[];
  usageCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplateRequest {
  label: string;
  description?: string;
  purpose?: string;
  content: string;
}

export interface UseTemplateRequest {
  variables?: Record<string, string>;
}

export interface TemplateSuggestion {
  id: string;
  label: string;
  description?: string;
  relevanceScore?: number;
}

export async function listTemplates(params?: {
  category?: string;
  limit?: number;
  purpose?: string;
}): Promise<Template[]> {
  const query = new URLSearchParams();
  if (params?.purpose) query.set('purpose', params.purpose);
  if (params?.category) query.set('category', params.category);
  if (params?.limit) query.set('limit', String(params.limit));
  const qs = query.toString();
  const path = qs ? `/templates?${qs}` : '/templates';
  const response = await get<JsonApiCollectionResponse>(path);
  return flattenCollection<Template>(response);
}

export async function getTemplate(id: string): Promise<Template> {
  const response = await get<JsonApiSingleResponse>(`/templates/${id}`);
  return flattenSingle<Template>(response);
}

export async function createTemplate(request: CreateTemplateRequest): Promise<Template> {
  const response = await post<JsonApiSingleResponse>(
    '/templates',
    request as unknown as Record<string, unknown>
  );
  return flattenSingle<Template>(response);
}

export async function useTemplate(
  id: string,
  request: UseTemplateRequest
): Promise<{ content: string }> {
  const response = await post<JsonApiSingleResponse>(
    `/templates/${id}/use`,
    request as unknown as Record<string, unknown>
  );
  return flattenSingle<{ content: string }>(response);
}

export async function getPopularTemplates(limit = 10): Promise<Template[]> {
  const response = await get<JsonApiCollectionResponse>(`/templates/popular?limit=${limit}`);
  return flattenCollection<Template>(response);
}

export async function suggestTemplates(prompt: string): Promise<TemplateSuggestion[]> {
  const response = await post<JsonApiCollectionResponse>('/templates/suggest', { prompt });
  return flattenCollection<TemplateSuggestion>(response);
}

export async function deleteTemplate(id: string): Promise<void> {
  await del(`/templates/${id}`);
}
