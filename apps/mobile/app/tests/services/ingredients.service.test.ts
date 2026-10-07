import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      extra: {
        apiUrl: 'https://api.test.com',
      },
    },
  },
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

function mockSuccessfulFetch(response: unknown): void {
  mockFetch.mockResolvedValueOnce({
    json: () => Promise.resolve(response),
    ok: true,
    status: 200,
  });
}

function mockFailedFetch(status: number, statusText: string): void {
  mockFetch.mockResolvedValueOnce({
    json: () => Promise.resolve({}),
    ok: false,
    status,
    statusText,
  });
}

import { ingredientsService } from '@/services/api/ingredients.service';

const scope = { brandId: 'brand-1', organizationId: 'org-1' };

describe('IngredientsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findAll', () => {
    const imageDocument = {
      data: [
        {
          attributes: {
            category: 'IMAGE',
            cdnUrl: 'https://cdn.example/image.jpg',
            createdAt: '2024-01-01T00:00:00Z',
            metadata: {
              height: 600,
              label: 'Test Image',
              width: 800,
            },
            status: 'COMPLETED',
            updatedAt: '2024-01-01T00:00:00Z',
          },
          id: '1',
          type: 'images',
        },
      ],
    };

    it('should fetch images by default with organization and brand scope', async () => {
      mockSuccessfulFetch(imageDocument);

      const result = await ingredientsService.findAll('test-token', scope);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/v1/images?brandId=brand-1&organizationId=org-1',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
          method: 'GET',
        }),
      );
      expect(result.data[0]).toMatchObject({
        cdnUrl: 'https://cdn.example/image.jpg',
        id: '1',
        metadata: { height: 600, label: 'Test Image', width: 800 },
      });
    });

    it('should fetch videos when category is video', async () => {
      mockSuccessfulFetch(imageDocument);

      await ingredientsService.findAll('test-token', scope, {
        category: 'video',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/v1/videos?brandId=brand-1&organizationId=org-1',
        expect.any(Object),
      );
    });

    it('should send page and limit, not pageSize', async () => {
      mockSuccessfulFetch(imageDocument);

      await ingredientsService.findAll('test-token', scope, {
        limit: 20,
        page: 2,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/v1/images?brandId=brand-1&limit=20&organizationId=org-1&page=2',
        expect.any(Object),
      );
    });

    it('resolves metadata from included resources', async () => {
      mockSuccessfulFetch({
        data: [
          {
            attributes: { cdnUrl: 'https://cdn.example/a.jpg' },
            id: '1',
            relationships: {
              metadata: { data: { id: 'meta-1', type: 'metadata' } },
            },
            type: 'images',
          },
        ],
        included: [
          {
            attributes: { description: 'A clip', label: 'From included' },
            id: 'meta-1',
            type: 'metadata',
          },
        ],
      });

      const result = await ingredientsService.findAll('test-token', scope);

      expect(result.data[0]?.metadata).toEqual({
        description: 'A clip',
        label: 'From included',
      });
    });

    it('should throw a not-found error when the list response fails', async () => {
      mockFailedFetch(404, 'Not Found');

      await expect(
        ingredientsService.findAll('test-token', scope),
      ).rejects.toThrow('That record was not found.');
    });
  });

  describe('findOne', () => {
    it('should fetch an image by id', async () => {
      mockSuccessfulFetch({
        data: {
          attributes: {
            category: 'IMAGE',
            createdAt: '2024-01-01T00:00:00Z',
            status: 'COMPLETED',
            updatedAt: '2024-01-01T00:00:00Z',
          },
          id: '123',
          type: 'images',
        },
      });

      const result = await ingredientsService.findOne(
        'test-token',
        scope,
        '123',
        'image',
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/v1/images/123?brandId=brand-1&organizationId=org-1',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
          method: 'GET',
        }),
      );
      expect(result.data).toEqual({
        item: {
          category: 'IMAGE',
          createdAt: '2024-01-01T00:00:00Z',
          id: '123',
          status: 'COMPLETED',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        kind: 'media',
      });
    });

    it('should use the videos endpoint for a video', async () => {
      mockSuccessfulFetch({
        data: {
          attributes: { status: 'COMPLETED' },
          id: '123',
          type: 'videos',
        },
      });

      await ingredientsService.findOne('test-token', scope, '123', 'video');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/v1/videos/123?brandId=brand-1&organizationId=org-1',
        expect.any(Object),
      );
    });

    it('should use the articles endpoint for an article', async () => {
      mockSuccessfulFetch({
        data: {
          attributes: { label: 'Note', summary: 'Short' },
          id: '123',
          type: 'articles',
        },
      });

      const result = await ingredientsService.findOne(
        'test-token',
        scope,
        '123',
        'article',
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/v1/articles/123?brandId=brand-1&organizationId=org-1',
        expect.any(Object),
      );
      expect(result.data).toEqual({
        item: { id: '123', label: 'Note', summary: 'Short' },
        kind: 'article',
      });
    });

    it('should throw a not-found error when the detail response fails', async () => {
      mockFailedFetch(404, 'Not Found');

      await expect(
        ingredientsService.findOne('test-token', scope, '123', 'image'),
      ).rejects.toThrow('That record was not found.');
    });
  });
});
