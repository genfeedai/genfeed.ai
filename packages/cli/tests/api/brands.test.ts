import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBrand, listBrands } from '../../src/api/brands.js';

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

describe('api/brands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiUrl.mockReturnValue('https://api.genfeed.ai/v1');
    mockApiKey.mockReturnValue(undefined);
  });

  describe('listBrands', () => {
    it('flattens JSON:API collection response', async () => {
      mockFetch.mockResolvedValue({
        data: [
          {
            attributes: {
              createdAt: '2024-01-01T00:00:00Z',
              description: 'First brand',
              label: 'Brand One',
              updatedAt: '2024-01-01T00:00:00Z',
            },
            id: 'brand-1',
            type: 'brand',
          },
          {
            attributes: {
              createdAt: '2024-01-02T00:00:00Z',
              label: 'Brand Two',
              updatedAt: '2024-01-02T00:00:00Z',
            },
            id: 'brand-2',
            type: 'brand',
          },
        ],
      });

      const result = await listBrands('org-123');

      expect(mockFetch).toHaveBeenCalledWith('/organizations/org-123/brands', { method: 'GET' });
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('brand-1');
      expect(result[0].label).toBe('Brand One');
      expect(result[1].label).toBe('Brand Two');
    });

    it('returns empty array when no brands', async () => {
      mockFetch.mockResolvedValue({ data: [] });

      const result = await listBrands('org-123');

      expect(result).toHaveLength(0);
    });
  });

  describe('getBrand', () => {
    it('flattens JSON:API single response', async () => {
      mockFetch.mockResolvedValue({
        data: {
          attributes: {
            createdAt: '2024-01-01T00:00:00Z',
            description: 'Test description',
            label: 'Brand One',
            updatedAt: '2024-01-01T00:00:00Z',
          },
          id: 'brand-1',
          type: 'brand',
        },
      });

      const result = await getBrand('brand-1');

      expect(mockFetch).toHaveBeenCalledWith('/brands/brand-1', { method: 'GET' });
      expect(result.id).toBe('brand-1');
      expect(result.label).toBe('Brand One');
    });

    it('propagates errors for invalid brand id', async () => {
      mockFetch.mockRejectedValue(new Error('Not found'));

      await expect(getBrand('invalid-id')).rejects.toThrow('Not found');
    });
  });
});
