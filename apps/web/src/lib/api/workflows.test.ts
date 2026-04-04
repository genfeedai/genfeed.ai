import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowData } from './workflows';
import { workflowsApi } from './workflows';

// Mock the apiClient
vi.mock('./client', () => ({
  apiClient: {
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

describe('workflowsApi', () => {
  const mockWorkflow: WorkflowData = {
    _id: 'workflow-1',
    createdAt: '2025-01-01T00:00:00.000Z',
    description: 'A test workflow',
    edgeStyle: 'bezier',
    edges: [],
    groups: [],
    name: 'Test Workflow',
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

      expect(apiClient.get).toHaveBeenCalledWith('/workflows', { signal: undefined });
      expect(result).toEqual([mockWorkflow]);
    });

    it('should pass abort signal when provided', async () => {
      const { apiClient } = await import('./client');
      vi.mocked(apiClient.get).mockResolvedValueOnce([]);

      const controller = new AbortController();
      await workflowsApi.getAll(undefined, controller.signal);

      expect(apiClient.get).toHaveBeenCalledWith('/workflows', { signal: controller.signal });
    });
  });

  describe('getById', () => {
    it('should fetch workflow by ID', async () => {
      const { apiClient } = await import('./client');
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockWorkflow);

      const result = await workflowsApi.getById('workflow-1');

      expect(apiClient.get).toHaveBeenCalledWith('/workflows/workflow-1', { signal: undefined });
      expect(result).toEqual(mockWorkflow);
    });
  });

  describe('create', () => {
    it('should create a new workflow', async () => {
      const { apiClient } = await import('./client');
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockWorkflow);

      const createData = {
        edges: [],
        name: 'Test Workflow',
        nodes: [],
      };

      const result = await workflowsApi.create(createData);

      expect(apiClient.post).toHaveBeenCalledWith('/workflows', createData, { signal: undefined });
      expect(result).toEqual(mockWorkflow);
    });

    it('should handle optional fields', async () => {
      const { apiClient } = await import('./client');
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockWorkflow);

      const createData = {
        description: 'With all fields',
        edgeStyle: 'step',
        edges: [],
        groups: [],
        name: 'Full Workflow',
        nodes: [],
      };

      await workflowsApi.create(createData);

      expect(apiClient.post).toHaveBeenCalledWith('/workflows', createData, { signal: undefined });
    });
  });

  describe('update', () => {
    it('should update an existing workflow', async () => {
      const { apiClient } = await import('./client');
      const updatedWorkflow = { ...mockWorkflow, name: 'Updated Workflow' };
      vi.mocked(apiClient.put).mockResolvedValueOnce(updatedWorkflow);

      const updateData = { name: 'Updated Workflow' };
      const result = await workflowsApi.update('workflow-1', updateData);

      expect(apiClient.put).toHaveBeenCalledWith('/workflows/workflow-1', updateData, {
        signal: undefined,
      });
      expect(result.name).toBe('Updated Workflow');
    });

    it('should update nodes and edges', async () => {
      const { apiClient } = await import('./client');
      vi.mocked(apiClient.put).mockResolvedValueOnce(mockWorkflow);

      const updateData = {
        edges: [],
        nodes: [
          {
            data: { label: 'Prompt', prompt: '', status: 'idle' },
            id: 'node-1',
            position: { x: 0, y: 0 },
            type: 'prompt',
          },
        ],
      };

      await workflowsApi.update(
        'workflow-1',
        updateData as unknown as Parameters<typeof workflowsApi.update>[1]
      );

      expect(apiClient.put).toHaveBeenCalledWith(
        '/workflows/workflow-1',
        expect.objectContaining({
          edges: expect.any(Array),
          nodes: expect.any(Array),
        }),
        { signal: undefined }
      );
    });
  });

  describe('delete', () => {
    it('should delete a workflow', async () => {
      const { apiClient } = await import('./client');
      vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

      await workflowsApi.delete('workflow-1');

      expect(apiClient.delete).toHaveBeenCalledWith('/workflows/workflow-1', { signal: undefined });
    });
  });

  describe('duplicate', () => {
    it('should duplicate a workflow', async () => {
      const { apiClient } = await import('./client');
      const duplicatedWorkflow = {
        ...mockWorkflow,
        _id: 'workflow-2',
        name: 'Test Workflow (Copy)',
      };
      vi.mocked(apiClient.post).mockResolvedValueOnce(duplicatedWorkflow);

      const result = await workflowsApi.duplicate('workflow-1');

      expect(apiClient.post).toHaveBeenCalledWith('/workflows/workflow-1/duplicate', undefined, {
        signal: undefined,
      });
      expect(result._id).toBe('workflow-2');
      expect(result.name).toBe('Test Workflow (Copy)');
    });
  });
});
