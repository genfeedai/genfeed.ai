import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createImage, getImage } from '../../src/api/images.js';

const mockApiKey = vi.fn<[], string | undefined>();
const mockApiUrl = vi.fn<[], string>();
const mockFetch = vi.fn();

vi.mock('../../src/config/store.js', () => ({
  getApiKey: () => mockApiKey(),
  getApiUrl: () => mockApiUrl(),
}));

vi.mock('ofetch', () => ({
  ofetch: {
    create: () => mockFetch,
  },
}));

describe('api/images', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiUrl.mockReturnValue('https://api.genfeed.ai/v1');
    mockApiKey.mockReturnValue(undefined);
  });

  describe('createImage', () => {
    it('sends POST and flattens JSON:API response', async () => {
      mockFetch.mockResolvedValue({
        data: {
          attributes: {
            createdAt: '2024-01-01T00:00:00Z',
            model: 'imagen-4',
            status: 'processing',
            updatedAt: '2024-01-01T00:00:00Z',
          },
          id: 'img-1',
          type: 'image',
        },
      });

      const result = await createImage({
        brand: 'brand-1',
        text: 'A sunset over mountains',
      });

      expect(mockFetch).toHaveBeenCalledWith('/images', {
        body: {
          brand: 'brand-1',
          text: 'A sunset over mountains',
        },
        method: 'POST',
      });
      expect(result.id).toBe('img-1');
      expect(result.status).toBe('processing');
      expect(result.model).toBe('imagen-4');
    });

    it('passes optional dimensions', async () => {
      mockFetch.mockResolvedValue({
        data: {
          attributes: {
            height: 768,
            model: 'imagen-4',
            status: 'processing',
            width: 1024,
          },
          id: 'img-2',
          type: 'image',
        },
      });

      const result = await createImage({
        brand: 'brand-1',
        height: 768,
        text: 'A cat',
        width: 1024,
      });

      expect(result.width).toBe(1024);
      expect(result.height).toBe(768);
    });
  });

  describe('getImage', () => {
    it('flattens completed image with url', async () => {
      mockFetch.mockResolvedValue({
        data: {
          attributes: {
            completedAt: '2024-01-01T00:01:00Z',
            height: 1024,
            model: 'imagen-4',
            status: 'completed',
            url: 'https://cdn.genfeed.ai/img.png',
            width: 1024,
          },
          id: 'img-1',
          type: 'image',
        },
      });

      const result = await getImage('img-1');

      expect(mockFetch).toHaveBeenCalledWith('/images/img-1', { method: 'GET' });
      expect(result.id).toBe('img-1');
      expect(result.status).toBe('completed');
      expect(result.url).toBe('https://cdn.genfeed.ai/img.png');
      expect(result.width).toBe(1024);
    });

    it('flattens failed image with error', async () => {
      mockFetch.mockResolvedValue({
        data: {
          attributes: {
            error: 'Content policy violation',
            model: 'imagen-4',
            status: 'failed',
          },
          id: 'img-1',
          type: 'image',
        },
      });

      const result = await getImage('img-1');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Content policy violation');
    });

    it('propagates errors', async () => {
      mockFetch.mockRejectedValue(new Error('Not found'));

      await expect(getImage('invalid')).rejects.toThrow('Not found');
    });
  });
});
