import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock expo-constants
vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      extra: {
        apiUrl: 'https://api.test.com',
      },
    },
  },
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import {
  type Ingredient,
  type IngredientResponse,
  type IngredientsResponse,
  ingredientsService,
} from '@/services/api/ingredients.service';

describe('IngredientsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findAll', () => {
    const mockIngredients: Ingredient[] = [
      {
        attributes: {
          category: 'image',
          createdAt: '2024-01-01T00:00:00Z',
          ingredientUrl: 'https://example.com/image.jpg',
          metadata: {
            height: 600,
            title: 'Test Image',
            width: 800,
          },
          status: 'active',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        id: '1',
        type: 'attributes',
      },
    ];

    const mockResponse: IngredientsResponse = {
      data: mockIngredients,
      meta: {
        pagination: {
          page: 1,
          pageCount: 1,
          pageSize: 10,
          total: 1,
        },
      },
    };

    it('should fetch images by default', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockResponse),
        ok: true,
      });

      const result = await ingredientsService.findAll('test-token');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/images',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
          method: 'GET',
        }),
      );
      expect(result).toEqual(mockResponse);
    });

    it('should fetch videos when category is video', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockResponse),
        ok: true,
      });

      await ingredientsService.findAll('test-token', { category: 'video' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/videos',
        expect.any(Object),
      );
    });

    it('should fetch articles when category is article', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockResponse),
        ok: true,
      });

      await ingredientsService.findAll('test-token', { category: 'article' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/articles',
        expect.any(Object),
      );
    });

    it('should include pagination params when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockResponse),
        ok: true,
      });

      await ingredientsService.findAll('test-token', { page: 2, pageSize: 20 });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/images?page=2&pageSize=20',
        expect.any(Object),
      );
    });

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      });

      await expect(ingredientsService.findAll('test-token')).rejects.toThrow(
        'Request failed: Not Found',
      );
    });
  });

  describe('findOne', () => {
    const mockIngredient: Ingredient = {
      attributes: {
        category: 'image',
        createdAt: '2024-01-01T00:00:00Z',
        status: 'active',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      id: '1',
      type: 'attributes',
    };

    const mockResponse: IngredientResponse = {
      data: mockIngredient,
    };

    it('should fetch single ingredient by id', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockResponse),
        ok: true,
      });

      const result = await ingredientsService.findOne('test-token', '123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/ingredients/123',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
          method: 'GET',
        }),
      );
      expect(result).toEqual(mockResponse);
    });

    it('should use category-specific endpoint when category is provided', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockResponse),
        ok: true,
      });

      await ingredientsService.findOne('test-token', '123', 'image');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/images/123',
        expect.any(Object),
      );
    });

    it('should use articles endpoint for article category', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockResponse),
        ok: true,
      });

      await ingredientsService.findOne('test-token', '123', 'article');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/articles/123',
        expect.any(Object),
      );
    });

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      });

      await expect(
        ingredientsService.findOne('test-token', '123'),
      ).rejects.toThrow('Request failed: Not Found');
    });
  });
});
