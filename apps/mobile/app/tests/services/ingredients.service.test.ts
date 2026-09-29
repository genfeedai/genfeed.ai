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

function mockSuccessfulFetch(response: unknown): void {
  mockFetch.mockResolvedValueOnce({
    json: () => Promise.resolve(response),
    ok: true,
  });
}

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
      mockSuccessfulFetch(mockResponse);

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

    it('should fetch articles when category is article', async () => {
      mockSuccessfulFetch(mockResponse);

      await ingredientsService.findAll('test-token', { category: 'article' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/articles',
        expect.any(Object),
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
      mockSuccessfulFetch(mockResponse);

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

    it('should use articles endpoint for article category', async () => {
      mockSuccessfulFetch(mockResponse);

      await ingredientsService.findOne('test-token', '123', 'article');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/articles/123',
        expect.any(Object),
      );
    });
  });
});
