import { WorkflowTemplateCategory } from '@genfeedai/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TemplateData } from './templates';
import { templatesApi } from './templates';

// Mock the apiClient
vi.mock('./client', () => ({
  apiClient: {
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

describe('templatesApi', () => {
  const mockTemplate: TemplateData = {
    _id: 'template-1',
    category: WorkflowTemplateCategory.IMAGE,
    createdAt: '2026-01-15T00:00:00.000Z',
    description: 'A test template',
    edgeStyle: 'default',
    edges: [],
    isSystem: false,
    name: 'Test Template',
    nodes: [],
    updatedAt: '2026-01-15T00:00:00.000Z',
    version: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getAll', () => {
    it('should get all templates', async () => {
      const { apiClient } = await import('./client');
      vi.mocked(apiClient.get).mockResolvedValueOnce([mockTemplate]);

      const result = await templatesApi.getAll();

      expect(apiClient.get).toHaveBeenCalledWith('/templates', { signal: undefined });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Test Template');
    });

    it('should return empty array when no templates', async () => {
      const { apiClient } = await import('./client');
      vi.mocked(apiClient.get).mockResolvedValueOnce([]);

      const result = await templatesApi.getAll();
      expect(result).toEqual([]);
    });
  });

  describe('getByCategory', () => {
    it('should get templates by category', async () => {
      const { apiClient } = await import('./client');
      vi.mocked(apiClient.get).mockResolvedValueOnce([mockTemplate]);

      const result = await templatesApi.getByCategory(WorkflowTemplateCategory.IMAGE);

      expect(apiClient.get).toHaveBeenCalledWith('/templates?category=image', {
        signal: undefined,
      });
      expect(result).toHaveLength(1);
      expect(result[0].category).toBe(WorkflowTemplateCategory.IMAGE);
    });

    it('should filter video templates', async () => {
      const { apiClient } = await import('./client');
      const videoTemplate = { ...mockTemplate, category: WorkflowTemplateCategory.VIDEO };
      vi.mocked(apiClient.get).mockResolvedValueOnce([videoTemplate]);

      const result = await templatesApi.getByCategory('video');
      expect(result[0].category).toBe('video');
    });
  });

  describe('getById', () => {
    it('should get a single template by ID', async () => {
      const { apiClient } = await import('./client');
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockTemplate);

      const result = await templatesApi.getById('template-1');

      expect(apiClient.get).toHaveBeenCalledWith('/templates/template-1', { signal: undefined });
      expect(result._id).toBe('template-1');
      expect(result.name).toBe('Test Template');
    });
  });

  describe('create', () => {
    it('should create a new template', async () => {
      const { apiClient } = await import('./client');
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockTemplate);

      const createData = {
        category: WorkflowTemplateCategory.IMAGE,
        edges: [],
        name: 'New Template',
        nodes: [],
      };

      const result = await templatesApi.create(createData);

      expect(apiClient.post).toHaveBeenCalledWith('/templates', createData, { signal: undefined });
      expect(result.name).toBe('Test Template');
    });

    it('should create template with edgeStyle', async () => {
      const { apiClient } = await import('./client');
      const templateWithStyle = { ...mockTemplate, edgeStyle: 'smoothstep' };
      vi.mocked(apiClient.post).mockResolvedValueOnce(templateWithStyle);

      const createData = {
        category: WorkflowTemplateCategory.FULL_PIPELINE,
        edgeStyle: 'smoothstep',
        edges: [],
        name: 'Complex Template',
        nodes: [],
      };

      const result = await templatesApi.create(createData);

      expect(result.edgeStyle).toBe('smoothstep');
    });
  });

  describe('delete', () => {
    it('should delete a template', async () => {
      const { apiClient } = await import('./client');
      vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

      await templatesApi.delete('template-1');

      expect(apiClient.delete).toHaveBeenCalledWith('/templates/template-1', { signal: undefined });
    });
  });

  describe('seed', () => {
    it('should seed system templates', async () => {
      const { apiClient } = await import('./client');
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        message: 'System templates seeded successfully',
      });

      const result = await templatesApi.seed();

      expect(apiClient.post).toHaveBeenCalledWith('/templates/seed', undefined, {
        signal: undefined,
      });
      expect(result.message).toBe('System templates seeded successfully');
    });
  });

  describe('abort signal handling', () => {
    it('should pass abort signal to all methods', async () => {
      const { apiClient } = await import('./client');
      vi.mocked(apiClient.get).mockResolvedValueOnce([]);

      const controller = new AbortController();
      await templatesApi.getAll(controller.signal);

      expect(apiClient.get).toHaveBeenCalledWith('/templates', { signal: controller.signal });
    });
  });
});
