import type { ICreatePrompt, IPrompt, IQueryPrompts } from '@genfeedai/types';
import { apiClient } from './client';

/**
 * Build query string from params
 */
function buildQueryString(query?: IQueryPrompts): string {
  if (!query) return '';

  const params = new URLSearchParams();

  if (query.category) params.append('category', query.category);
  if (query.search) params.append('search', query.search);
  if (query.tag) params.append('tag', query.tag);
  if (query.limit) params.append('limit', String(query.limit));
  if (query.offset) params.append('offset', String(query.offset));
  if (query.sortBy) params.append('sortBy', query.sortBy);
  if (query.sortOrder) params.append('sortOrder', query.sortOrder);

  const queryString = params.toString();
  return queryString ? `?${queryString}` : '';
}

export const promptsApi = {
  /**
   * Create a new prompt library item
   */
  create: (data: ICreatePrompt, signal?: AbortSignal): Promise<IPrompt> =>
    apiClient.post<IPrompt>('/prompts', data, { signal }),

  /**
   * Delete a prompt library item (soft delete)
   */
  delete: (id: string, signal?: AbortSignal): Promise<void> =>
    apiClient.delete<void>(`/prompts/${id}`, { signal }),

  /**
   * Duplicate a prompt library item
   */
  duplicate: (id: string, signal?: AbortSignal): Promise<IPrompt> =>
    apiClient.post<IPrompt>(`/prompts/${id}/duplicate`, undefined, { signal }),

  /**
   * Get all prompt library items with optional filters
   */
  getAll: (query?: IQueryPrompts, signal?: AbortSignal): Promise<IPrompt[]> =>
    apiClient.get<IPrompt[]>(`/prompts${buildQueryString(query)}`, { signal }),

  /**
   * Get a single prompt library item by ID
   */
  getById: (id: string, signal?: AbortSignal): Promise<IPrompt> =>
    apiClient.get<IPrompt>(`/prompts/${id}`, { signal }),

  /**
   * Get featured prompt library items
   */
  getFeatured: (limit?: number, signal?: AbortSignal): Promise<IPrompt[]> =>
    apiClient.get<IPrompt[]>(`/prompts/featured${limit ? `?limit=${limit}` : ''}`, { signal }),

  /**
   * Update a prompt library item
   */
  update: (id: string, data: Partial<ICreatePrompt>, signal?: AbortSignal): Promise<IPrompt> =>
    apiClient.put<IPrompt>(`/prompts/${id}`, data, { signal }),

  /**
   * Track usage of a prompt (increments useCount)
   */
  use: (id: string, signal?: AbortSignal): Promise<IPrompt> =>
    apiClient.post<IPrompt>(`/prompts/${id}/use`, undefined, { signal }),
};
