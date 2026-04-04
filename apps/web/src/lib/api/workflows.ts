import type { WorkflowEdge, WorkflowFile, WorkflowInterface, WorkflowNode } from '@genfeedai/types';
import type { NodeGroup } from '@/types/groups';
import { apiClient } from './client';

/**
 * Workflow export format — uses canonical WorkflowFile from @genfeedai/types.
 */
export type WorkflowExport = WorkflowFile;

export interface WorkflowData {
  _id: string;
  name: string;
  description?: string;
  version: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  edgeStyle: string;
  groups?: NodeGroup[];
  tags?: string[];
  thumbnail?: string | null;
  thumbnailNodeId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkflowInput {
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  edgeStyle?: string;
  groups?: NodeGroup[];
  tags?: string[];
}

export interface UpdateWorkflowInput {
  name?: string;
  description?: string;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
  edgeStyle?: string;
  groups?: NodeGroup[];
  tags?: string[];
}

export const workflowsApi = {
  /**
   * Create a new workflow
   */
  create: (data: CreateWorkflowInput, signal?: AbortSignal): Promise<WorkflowData> =>
    apiClient.post<WorkflowData>('/workflows', data, { signal }),

  /**
   * Delete a workflow (soft delete)
   */
  delete: (id: string, signal?: AbortSignal): Promise<void> =>
    apiClient.delete<void>(`/workflows/${id}`, { signal }),

  /**
   * Download workflow as JSON file (client-side helper)
   */
  downloadAsFile: async (id: string, signal?: AbortSignal): Promise<void> => {
    const workflow = await workflowsApi.export(id, signal);
    const blob = new Blob([JSON.stringify(workflow, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workflow.name.toLowerCase().replace(/\s+/g, '-')}.genfeed.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * Duplicate a workflow
   */
  duplicate: (id: string, signal?: AbortSignal): Promise<WorkflowData> =>
    apiClient.post<WorkflowData>(`/workflows/${id}/duplicate`, undefined, { signal }),

  // Export/Import endpoints

  /**
   * Export a workflow to JSON format for sharing
   */
  export: (id: string, signal?: AbortSignal): Promise<WorkflowExport> =>
    apiClient.get<WorkflowExport>(`/workflows/${id}/export`, { signal }),
  /**
   * Get all workflows, optionally filtered by search and tag
   */
  getAll: (
    params?: { search?: string; tag?: string },
    signal?: AbortSignal
  ): Promise<WorkflowData[]> => {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set('search', params.search);
    if (params?.tag) searchParams.set('tag', params.tag);
    const qs = searchParams.toString();
    return apiClient.get<WorkflowData[]>(`/workflows${qs ? `?${qs}` : ''}`, { signal });
  },

  /**
   * Get all unique tags
   */
  getAllTags: (signal?: AbortSignal): Promise<string[]> =>
    apiClient.get<string[]>('/workflows/tags', { signal }),

  /**
   * Get a single workflow by ID
   */
  getById: (id: string, signal?: AbortSignal): Promise<WorkflowData> =>
    apiClient.get<WorkflowData>(`/workflows/${id}`, { signal }),

  // Composition endpoints

  /**
   * Get the interface of a workflow (inputs/outputs defined by boundary nodes)
   */
  getInterface: (id: string, signal?: AbortSignal): Promise<WorkflowInterface> =>
    apiClient.get<WorkflowInterface>(`/workflows/${id}/interface`, { signal }),

  /**
   * Get workflows that can be referenced as subworkflows (have defined interface)
   */
  getReferencable: (
    excludeWorkflowId?: string,
    signal?: AbortSignal
  ): Promise<Array<WorkflowData & { interface: WorkflowInterface }>> =>
    apiClient.get<Array<WorkflowData & { interface: WorkflowInterface }>>(
      `/workflows/referencable${excludeWorkflowId ? `?exclude=${excludeWorkflowId}` : ''}`,
      { signal }
    ),

  /**
   * Import a workflow from JSON export
   */
  import: (data: WorkflowExport, signal?: AbortSignal): Promise<WorkflowData> =>
    apiClient.post<WorkflowData>('/workflows/import', data, { signal }),

  /**
   * Import workflow from file (client-side helper)
   */
  importFromFile: async (file: File, signal?: AbortSignal): Promise<WorkflowData> => {
    const text = await file.text();
    const data = JSON.parse(text) as WorkflowExport;
    return workflowsApi.import(data, signal);
  },

  /**
   * Set the thumbnail for a workflow
   */
  setThumbnail: (
    id: string,
    thumbnailUrl: string,
    nodeId: string,
    signal?: AbortSignal
  ): Promise<WorkflowData> =>
    apiClient.put<WorkflowData>(`/workflows/${id}/thumbnail`, { nodeId, thumbnailUrl }, { signal }),

  /**
   * Update an existing workflow
   */
  update: (id: string, data: UpdateWorkflowInput, signal?: AbortSignal): Promise<WorkflowData> =>
    apiClient.put<WorkflowData>(`/workflows/${id}`, data, { signal }),

  /**
   * Validate a workflow reference (checks for circular references)
   * Returns the child workflow's interface if valid
   */
  validateReference: (
    parentWorkflowId: string,
    childWorkflowId: string,
    signal?: AbortSignal
  ): Promise<WorkflowInterface> =>
    apiClient.post<WorkflowInterface>(
      `/workflows/${parentWorkflowId}/validate-reference`,
      { childWorkflowId },
      { signal }
    ),
};
