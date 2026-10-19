import { del, get, post } from './client';
import { flattenCollection, flattenSingle, type JsonApiDocument } from './json-api';

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
  sort?: 'popular';
}): Promise<Template[]> {
  const query = new URLSearchParams();
  if (params?.purpose) query.set('purpose', params.purpose);
  if (params?.category) query.set('category', params.category);
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.sort) query.set('sort', params.sort);
  const qs = query.toString();
  const path = qs ? `/templates?${qs}` : '/templates';
  const response = await get<JsonApiDocument>(path);
  return flattenCollection<Template>(response);
}

export async function getTemplate(id: string): Promise<Template> {
  const response = await get<JsonApiDocument>(`/templates/${id}`);
  return flattenSingle<Template>(response);
}

export async function createTemplate(request: CreateTemplateRequest): Promise<Template> {
  const response = await post<JsonApiDocument>('/templates', request);
  return flattenSingle<Template>(response);
}

export async function fillTemplate(
  id: string,
  request: UseTemplateRequest
): Promise<{ content: string }> {
  const response = await post<JsonApiDocument>(`/templates/${id}/use`, request);
  return flattenSingle<{ content: string }>(response);
}

export async function getPopularTemplates(limit = 10): Promise<Template[]> {
  const response = await get<JsonApiDocument>(`/templates?sort=popular&limit=${limit}`);
  return flattenCollection<Template>(response);
}

export async function suggestTemplates(prompt: string): Promise<TemplateSuggestion[]> {
  const response = await post<JsonApiDocument>('/templates/suggest', { prompt });
  return flattenCollection<TemplateSuggestion>(response);
}

export async function deleteTemplate(id: string): Promise<void> {
  await del(`/templates/${id}`);
}
