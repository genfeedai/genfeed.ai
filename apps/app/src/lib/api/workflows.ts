import type {
  NodeGroup,
  WorkflowEdge,
  WorkflowFile,
  WorkflowInterface,
  WorkflowNode,
} from '@genfeedai/types';
import type { WorkflowListItem } from '@/features/workflows/types/workflow-list-item';
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
  brandId?: string | null;
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
  brandId?: string | null;
}

export interface UpdateWorkflowInput {
  name?: string;
  description?: string;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
  edgeStyle?: string;
  groups?: NodeGroup[];
  tags?: string[];
  brandId?: string | null;
}

export const workflowsApi = {
  /**
   * Create a new workflow
   */
  create: (
    data: CreateWorkflowInput,
    signal?: AbortSignal,
  ): Promise<WorkflowData> => {
    const { name, ...rest } = data;
    return apiClient.post<WorkflowData>(
      '/workflows',
      { ...rest, label: name },
      { signal },
    );
  },

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
    const blob = new Blob([JSON.stringify(workflow, null, 2)], {
      type: 'application/json',
    });
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
  duplicate: (
    id: string,
    optionsOrSignal?: { brandId?: string | null } | AbortSignal,
    signal?: AbortSignal,
  ): Promise<WorkflowData> => {
    const isAbortSignal =
      optionsOrSignal &&
      'aborted' in optionsOrSignal &&
      'addEventListener' in optionsOrSignal;
    const options = isAbortSignal ? undefined : optionsOrSignal;
    const requestSignal = isAbortSignal ? optionsOrSignal : signal;

    return apiClient.post<WorkflowData>(`/workflows/${id}/clone`, options, {
      signal: requestSignal,
    });
  },

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
    signal?: AbortSignal,
  ): Promise<WorkflowListItem[]> => {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set('search', params.search);
    if (params?.tag) searchParams.set('tag', params.tag);
    const qs = searchParams.toString();
    return apiClient.get<WorkflowListItem[]>(
      `/workflows${qs ? `?${qs}` : ''}`,
      { signal },
    );
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
  getInterface: (
    id: string,
    signal?: AbortSignal,
  ): Promise<WorkflowInterface> =>
    apiClient.get<WorkflowInterface>(`/workflows/${id}/interface`, { signal }),

  /**
   * Get workflows that can be referenced as subworkflows (have defined interface).
   *
   * The dedicated `/workflows/referencable` RPC route was collapsed into
   * `GET /workflows?referencable=true` by the REST audit (#1354). The server
   * no longer supports an `exclude` query param, so `excludeWorkflowId` is
   * filtered out of the response client-side to preserve this method's
   * existing contract.
   */
  getReferencable: async (
    excludeWorkflowId?: string,
    signal?: AbortSignal,
  ): Promise<Array<WorkflowData & { interface: WorkflowInterface }>> => {
    const results = await apiClient.get<
      Array<WorkflowData & { interface: WorkflowInterface }>
    >('/workflows?referencable=true', { signal });
    return excludeWorkflowId
      ? results.filter((workflow) => workflow._id !== excludeWorkflowId)
      : results;
  },

  /**
   * Import a workflow from JSON export
   */
  import: (data: WorkflowExport, signal?: AbortSignal): Promise<WorkflowData> =>
    apiClient.post<WorkflowData>('/workflows/import', data, { signal }),

  /**
   * Import workflow from file (client-side helper)
   */
  importFromFile: async (
    file: File,
    signal?: AbortSignal,
  ): Promise<WorkflowData> => {
    const text = await file.text();
    const data = JSON.parse(text) as WorkflowExport;
    return workflowsApi.import(data, signal);
  },

  /**
   * Set the thumbnail for a workflow. The dedicated `/thumbnail` route was
   * collapsed into the generic workflow update endpoint by the REST audit
   * (#1354).
   */
  setThumbnail: (
    id: string,
    thumbnailUrl: string,
    nodeId: string,
    signal?: AbortSignal,
  ): Promise<WorkflowData> =>
    apiClient.patch<WorkflowData>(
      `/workflows/${id}`,
      { thumbnail: thumbnailUrl, thumbnailNodeId: nodeId },
      { signal },
    ),

  /**
   * Update an existing workflow
   */
  update: (
    id: string,
    data: UpdateWorkflowInput,
    signal?: AbortSignal,
  ): Promise<WorkflowData> => {
    const { name, ...rest } = data;
    return apiClient.patch<WorkflowData>(
      `/workflows/${id}`,
      {
        ...rest,
        ...(name !== undefined ? { label: name } : {}),
      },
      { signal },
    );
  },

  /**
   * Validate a workflow reference (checks for circular references)
   * Returns the child workflow's interface if valid
   */
  validateReference: (
    parentWorkflowId: string,
    childWorkflowId: string,
    signal?: AbortSignal,
  ): Promise<WorkflowInterface> =>
    apiClient.post<WorkflowInterface>(
      `/workflows/${parentWorkflowId}/validate-reference`,
      { childWorkflowId },
      { signal },
    ),
};
