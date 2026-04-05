import type { IPrompt } from '@genfeedai/types';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { apiClient } from './client';
import { promptsApi } from './prompts';

// Mock the apiClient
vi.mock('./client', () => ({
  apiClient: {
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

describe('promptsApi', () => {
  const mockPromptItem: IPrompt = {
    _id: 'prompt-1',
    category: 'landscape',
    createdAt: '2026-01-15T00:00:00.000Z',
    description: 'A test prompt',
    isDeleted: false,
    isFeatured: false,
    isSystem: false,
    name: 'Test Prompt',
    promptText: 'Generate a beautiful sunset',
    styleSettings: {},
    tags: ['nature', 'sunset'],
    updatedAt: '2026-01-15T00:00:00.000Z',
    useCount: 5,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('create', () => {
    it('should create a new prompt library item', async () => {
      (apiClient.post as Mock).mockResolvedValueOnce(mockPromptItem);

      const createData = {
        name: 'Test Prompt',
        promptText: 'Generate a beautiful sunset',
      };

      const result = await promptsApi.create(createData);

      expect(apiClient.post).toHaveBeenCalledWith('/prompts', createData, {
        signal: undefined,
      });
      expect(result.name).toBe('Test Prompt');
    });
  });

  describe('getAll', () => {
    it('should get all prompt library items', async () => {
      (apiClient.get as Mock).mockResolvedValueOnce([mockPromptItem]);

      const result = await promptsApi.getAll();

      expect(apiClient.get).toHaveBeenCalledWith('/prompts', { signal: undefined });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Test Prompt');
    });

    it('should pass query parameters', async () => {
      (apiClient.get as Mock).mockResolvedValueOnce([mockPromptItem]);

      await promptsApi.getAll({
        category: 'landscape',
        limit: 10,
        search: 'sunset',
      });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/prompts?category=landscape&search=sunset&limit=10',
        { signal: undefined }
      );
    });

    it('should handle empty query', async () => {
      (apiClient.get as Mock).mockResolvedValueOnce([]);

      const result = await promptsApi.getAll();
      expect(result).toEqual([]);
    });

    it('should pass sorting options', async () => {
      (apiClient.get as Mock).mockResolvedValueOnce([mockPromptItem]);

      await promptsApi.getAll({
        sortBy: 'useCount',
        sortOrder: 'desc',
      });

      expect(apiClient.get).toHaveBeenCalledWith('/prompts?sortBy=useCount&sortOrder=desc', {
        signal: undefined,
      });
    });
  });

  describe('getFeatured', () => {
    it('should get featured prompt items', async () => {
      const featuredItem = { ...mockPromptItem, isFeatured: true };
      (apiClient.get as Mock).mockResolvedValueOnce([featuredItem]);

      const result = await promptsApi.getFeatured();

      expect(apiClient.get).toHaveBeenCalledWith('/prompts/featured', { signal: undefined });
      expect(result).toHaveLength(1);
      expect(result[0].isFeatured).toBe(true);
    });

    it('should pass limit parameter', async () => {
      (apiClient.get as Mock).mockResolvedValueOnce([]);

      await promptsApi.getFeatured(5);

      expect(apiClient.get).toHaveBeenCalledWith('/prompts/featured?limit=5', {
        signal: undefined,
      });
    });
  });

  describe('getById', () => {
    it('should get a single prompt item by ID', async () => {
      (apiClient.get as Mock).mockResolvedValueOnce(mockPromptItem);

      const result = await promptsApi.getById('prompt-1');

      expect(apiClient.get).toHaveBeenCalledWith('/prompts/prompt-1', { signal: undefined });
      expect(result._id).toBe('prompt-1');
    });
  });

  describe('update', () => {
    it('should update a prompt item', async () => {
      const updatedItem = { ...mockPromptItem, name: 'Updated Prompt' };
      (apiClient.put as Mock).mockResolvedValueOnce(updatedItem);

      const updates = { name: 'Updated Prompt' };
      const result = await promptsApi.update('prompt-1', updates);

      expect(apiClient.put).toHaveBeenCalledWith('/prompts/prompt-1', updates, {
        signal: undefined,
      });
      expect(result.name).toBe('Updated Prompt');
    });
  });

  describe('delete', () => {
    it('should delete a prompt item', async () => {
      (apiClient.delete as Mock).mockResolvedValueOnce(undefined);

      await promptsApi.delete('prompt-1');

      expect(apiClient.delete).toHaveBeenCalledWith('/prompts/prompt-1', {
        signal: undefined,
      });
    });
  });

  describe('use', () => {
    it('should increment use count', async () => {
      const usedItem = { ...mockPromptItem, useCount: 6 };
      (apiClient.post as Mock).mockResolvedValueOnce(usedItem);

      const result = await promptsApi.use('prompt-1');

      expect(apiClient.post).toHaveBeenCalledWith('/prompts/prompt-1/use', undefined, {
        signal: undefined,
      });
      expect(result.useCount).toBe(6);
    });
  });

  describe('duplicate', () => {
    it('should duplicate a prompt item', async () => {
      const duplicatedItem = { ...mockPromptItem, _id: 'prompt-2', name: 'Test Prompt (Copy)' };
      (apiClient.post as Mock).mockResolvedValueOnce(duplicatedItem);

      const result = await promptsApi.duplicate('prompt-1');

      expect(apiClient.post).toHaveBeenCalledWith('/prompts/prompt-1/duplicate', undefined, {
        signal: undefined,
      });
      expect(result._id).toBe('prompt-2');
      expect(result.name).toBe('Test Prompt (Copy)');
    });
  });
});
