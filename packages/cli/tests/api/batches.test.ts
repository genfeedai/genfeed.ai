import { BatchStatus } from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBatch } from '../../src/api/batches';

const mockApiKey = vi.fn<[], string | undefined>();
const mockApiUrl = vi.fn<[], string>();
const mockFetch = vi.fn();

vi.mock('../../src/config/store', () => ({
  getApiKey: () => mockApiKey(),
  getApiUrl: () => mockApiUrl(),
}));

vi.mock('ofetch', () => ({
  ofetch: {
    create: () => mockFetch,
  },
}));

describe('api/batches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiUrl.mockReturnValue('https://api.genfeed.ai/v1');
    mockApiKey.mockReturnValue(undefined);
  });

  describe('createBatch', () => {
    it('posts brandId to /batches and never sends the legacy brand key', async () => {
      mockFetch.mockResolvedValue({
        data: {
          attributes: {
            count: 3,
            platforms: ['twitter', 'linkedin'],
            status: BatchStatus.PENDING,
          },
          id: 'batch-1',
          type: 'batch',
        },
      });

      const result = await createBatch({
        brandId: 'brand-1',
        count: 3,
        platforms: ['twitter', 'linkedin'],
      });

      expect(mockFetch).toHaveBeenCalledWith('/batches', {
        body: {
          brandId: 'brand-1',
          count: 3,
          platforms: ['twitter', 'linkedin'],
        },
        method: 'POST',
      });

      const body = mockFetch.mock.calls[0][1].body as Record<string, unknown>;
      expect(body).toHaveProperty('brandId', 'brand-1');
      expect(body).not.toHaveProperty('brand');
      expect(result.id).toBe('batch-1');
      expect(result.status).toBe(BatchStatus.PENDING);
    });
  });
});
