import { BatchStatus } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  batchItemAction,
  cancelBatch,
  createBatch,
  getBatch,
  listBatches,
} from '../../src/api/batches';

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

  describe('listBatches', () => {
    it('lists batches without params', async () => {
      mockFetch.mockResolvedValue({ data: [] });

      const result = await listBatches();

      expect(mockFetch).toHaveBeenCalledWith('/batches', { method: 'GET' });
      expect(result).toEqual([]);
    });

    it('lists batches with status and limit filters', async () => {
      mockFetch.mockResolvedValue({ data: [] });

      await listBatches({ limit: 5, status: BatchStatus.PENDING });

      expect(mockFetch).toHaveBeenCalledWith(`/batches?status=${BatchStatus.PENDING}&limit=5`, {
        method: 'GET',
      });
    });
  });

  describe('getBatch', () => {
    it('fetches a batch detail by id', async () => {
      mockFetch.mockResolvedValue({
        data: {
          attributes: { count: 1, platforms: ['twitter'], status: BatchStatus.COMPLETED },
          id: 'batch-9',
          type: 'batch',
        },
      });

      const result = await getBatch('batch-9');

      expect(mockFetch).toHaveBeenCalledWith('/batches/batch-9', { method: 'GET' });
      expect(result.id).toBe('batch-9');
      expect(result.status).toBe(BatchStatus.COMPLETED);
    });
  });

  describe('batchItemAction', () => {
    it('posts an approve action with item ids', async () => {
      mockFetch.mockResolvedValue({ data: null });

      await batchItemAction('batch-1', { action: 'approve', itemIds: ['item-1', 'item-2'] });

      expect(mockFetch).toHaveBeenCalledWith('/batches/batch-1/items/action', {
        body: { action: 'approve', itemIds: ['item-1', 'item-2'] },
        method: 'POST',
      });
    });
  });

  describe('cancelBatch', () => {
    it('patches the batch status to CANCELLED', async () => {
      mockFetch.mockResolvedValue({ data: null });

      await cancelBatch('batch-1');

      expect(mockFetch).toHaveBeenCalledWith('/batches/batch-1', {
        body: { status: BatchStatus.CANCELLED },
        method: 'PATCH',
      });
    });
  });
});
