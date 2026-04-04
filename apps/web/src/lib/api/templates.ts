import { WorkflowTemplateCategory, type WorkflowEdge, type WorkflowNode } from '@genfeedai/types';
import { apiClient } from './client';

export interface TemplateData {
  _id: string;
  name: string;
  description?: string;
  category: WorkflowTemplateCategory;
  thumbnail?: string;
  version: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  edgeStyle: string;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplateInput {
  name: string;
  description?: string;
  category: WorkflowTemplateCategory;
  thumbnail?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  edgeStyle?: string;
}

export const templatesApi = {
  /**
   * Create a new custom template
   */
  create: (data: CreateTemplateInput, signal?: AbortSignal): Promise<TemplateData> =>
    apiClient.post<TemplateData>('/templates', data, { signal }),

  /**
   * Delete a template (soft delete, only for user-created templates)
   */
  delete: (id: string, signal?: AbortSignal): Promise<void> =>
    apiClient.delete<void>(`/templates/${id}`, { signal }),
  /**
   * Get all templates
   */
  getAll: (signal?: AbortSignal): Promise<TemplateData[]> =>
    apiClient.get<TemplateData[]>('/templates', { signal }),

  /**
   * Get templates by category
   */
  getByCategory: (category: string, signal?: AbortSignal): Promise<TemplateData[]> =>
    apiClient.get<TemplateData[]>(`/templates?category=${category}`, { signal }),

  /**
   * Get a single template by ID
   */
  getById: (id: string, signal?: AbortSignal): Promise<TemplateData> =>
    apiClient.get<TemplateData>(`/templates/${id}`, { signal }),

  /**
   * Seed system templates (admin only)
   */
  seed: (signal?: AbortSignal): Promise<{ message: string }> =>
    apiClient.post<{ message: string }>('/templates/seed', undefined, { signal }),
};
