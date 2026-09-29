import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowData } from './workflows';
import { workflowsApi } from './workflows';

// Mock the apiClient
vi.mock('./client', () => ({
  apiClient: {
    delete: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

describe('workflowsApi', () => {
  const mockWorkflow: WorkflowData = {
    id: 'workflow-1',
    createdAt: '2025-01-01T00:00:00.000Z',
    description: 'A test workflow',
    edgeStyle: 'bezier',
    edges: [],
    groups: [],
    label: 'Test Workflow',
    nodes: [],
    updatedAt: '2025-01-01T00:00:00.000Z',
    version: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getAll', () => {
    it('should fetch all workflows', async () => {
      const { apiClient } = await import('./client');
      vi.mocked(apiClient.get).mockResolvedValueOnce([mockWorkflow]);

      const result = await workflowsApi.getAll();

      expect(apiClient.get).toHaveBeenCalledWith('/workflows', {
        signal: undefined,
      });
      expect(result).toEqual([mockWorkflow]);
    });
  });

  describe('getById', () => {
    it('should fetch workflow by ID', async () => {
      const { apiClient } = await import('./client');
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockWorkflow);

      const result = await workflowsApi.getById('workflow-1');

      expect(apiClient.get).toHaveBeenCalledWith('/workflows/workflow-1', {
        signal: undefined,
      });
      expect(result).toEqual(mockWorkflow);
    });
  });

  describe('create', () => {
    it('should create a new workflow', async () => {
      const { apiClient } = await import('./client');
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockWorkflow);

      const createData = {
        edges: [],
        label: 'Test Workflow',
        nodes: [],
      };

      const result = await workflowsApi.create(createData);

      expect(apiClient.post).toHaveBeenCalledWith(
        '/workflows',
        {
          edges: [],
          label: 'Test Workflow',
          nodes: [],
        },
        {
          signal: undefined,
        },
      );
      expect(result).toEqual(mockWorkflow);
    });
  });

  describe('update', () => {
    it('should update an existing workflow', async () => {
      const { apiClient } = await import('./client');
      const updatedWorkflow = { ...mockWorkflow, label: 'Updated Workflow' };
      vi.mocked(apiClient.patch).mockResolvedValueOnce(updatedWorkflow);

      const updateData = { label: 'Updated Workflow' };
      const result = await workflowsApi.update('workflow-1', updateData);

      expect(apiClient.patch).toHaveBeenCalledWith(
        '/workflows/workflow-1',
        { label: 'Updated Workflow' },
        {
          signal: undefined,
        },
      );
      expect(result.label).toBe('Updated Workflow');
    });
  });

  describe('delete', () => {
    it('should delete a workflow', async () => {
      const { apiClient } = await import('./client');
      vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

      await workflowsApi.delete('workflow-1');

      expect(apiClient.delete).toHaveBeenCalledWith('/workflows/workflow-1', {
        signal: undefined,
      });
    });
  });

  describe('duplicate', () => {
    it('should duplicate a workflow', async () => {
      const { apiClient } = await import('./client');
      const duplicatedWorkflow = {
        ...mockWorkflow,
        id: 'workflow-2',
        label: 'Test Workflow (Copy)',
      };
      vi.mocked(apiClient.post).mockResolvedValueOnce(duplicatedWorkflow);

      const result = await workflowsApi.duplicate('workflow-1');

      expect(apiClient.post).toHaveBeenCalledWith(
        '/workflows',
        { sourceWorkflowId: 'workflow-1' },
        {
          signal: undefined,
        },
      );
      expect(result.id).toBe('workflow-2');
      expect(result.label).toBe('Test Workflow (Copy)');
    });

    it('should duplicate a workflow for a target brand', async () => {
      const { apiClient } = await import('./client');
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        ...mockWorkflow,
        id: 'workflow-2',
        brandId: 'brand-2',
      });

      await workflowsApi.duplicate('workflow-1', { brandId: 'brand-2' });

      expect(apiClient.post).toHaveBeenCalledWith(
        '/workflows',
        {
          brandId: 'brand-2',
          sourceWorkflowId: 'workflow-1',
        },
        {
          signal: undefined,
        },
      );
    });

    it('should duplicate a workflow with an abort signal as the second argument', async () => {
      const { apiClient } = await import('./client');
      const abortController = new AbortController();
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockWorkflow);

      await workflowsApi.duplicate('workflow-1', abortController.signal);

      expect(apiClient.post).toHaveBeenCalledWith(
        '/workflows',
        { sourceWorkflowId: 'workflow-1' },
        {
          signal: abortController.signal,
        },
      );
    });
  });
});
