import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type BatchActionRequest,
  BatchesService,
  type BatchListQuery,
  type CreateManualReviewBatchRequest,
} from './batches.service';

vi.mock('@services/core/interceptor.service', () => {
  return {
    HTTPBaseService: class {
      protected instance: {
        get: ReturnType<typeof vi.fn>;
        post: ReturnType<typeof vi.fn>;
        delete: ReturnType<typeof vi.fn>;
      };
      constructor() {
        this.instance = {
          delete: vi.fn(),
          get: vi.fn(),
          post: vi.fn(),
        };
      }
    },
  };
});

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apiEndpoint: 'https://api.genfeed.ai',
  },
}));

vi.mock('@genfeedai/helpers/data/json-api/json-api.helper', () => ({
  deserializeCollection: vi.fn((doc) => doc.data ?? []),
  deserializeResource: vi.fn((doc) => doc.data ?? doc),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

const makeMockBatch = (id = 'batch-1') => ({
  id,
  items: [],
  status: 'pending',
});

describe('BatchesService', () => {
  let service: BatchesService;
  let mockInstance: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    // Clear singleton cache so each test gets a fresh instance
    (
      BatchesService as unknown as { instanceMap: Map<string, BatchesService> }
    ).instanceMap?.clear();
    service = new BatchesService('test-token');
    mockInstance = (service as unknown as { instance: typeof mockInstance })
      .instance;
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  it('getBatches fetches from the API with query params', async () => {
    const query: BatchListQuery = { limit: 5 };
    mockInstance.get.mockResolvedValue({ data: { data: [makeMockBatch()] } });

    const result = await service.getBatches(query);

    expect(mockInstance.get).toHaveBeenCalledWith('', { params: query });
    expect(result).toBeDefined();
  });

  it('getBatches works without query params', async () => {
    mockInstance.get.mockResolvedValue({ data: { data: [] } });

    await service.getBatches();

    expect(mockInstance.get).toHaveBeenCalledWith('', { params: undefined });
  });

  it('getBatches throws and logs on error', async () => {
    mockInstance.get.mockRejectedValue(new Error('network error'));

    await expect(service.getBatches()).rejects.toThrow('network error');
  });

  it('getBatch fetches a single batch by id', async () => {
    mockInstance.get.mockResolvedValue({
      data: { data: makeMockBatch('batch-42') },
    });

    const result = await service.getBatch('batch-42');

    expect(mockInstance.get).toHaveBeenCalledWith('/batch-42');
    expect(result).toBeDefined();
  });

  it('createManualReviewBatch POSTs to /manual-review', async () => {
    const req: CreateManualReviewBatchRequest = {
      brandId: 'brand-1',
      items: [{ format: 'video', mediaUrl: 'https://example.com/video.mp4' }],
    };
    mockInstance.post.mockResolvedValue({ data: { data: makeMockBatch() } });

    const result = await service.createManualReviewBatch(req);

    expect(mockInstance.post).toHaveBeenCalledWith('/manual-review', req);
    expect(result).toBeDefined();
  });

  it('createManualReviewBatch throws and logs on error', async () => {
    mockInstance.post.mockRejectedValue(new Error('validation error'));

    await expect(
      service.createManualReviewBatch({ brandId: 'b', items: [] }),
    ).rejects.toThrow('validation error');
  });

  it('itemAction POSTs to /:batchId/items/action', async () => {
    const req: BatchActionRequest = {
      action: 'approve',
      itemIds: ['item-1', 'item-2'],
    };
    mockInstance.post.mockResolvedValue({ data: { data: makeMockBatch() } });

    await service.itemAction('batch-1', req);

    expect(mockInstance.post).toHaveBeenCalledWith(
      '/batch-1/items/action',
      req,
    );
  });

  it('cancelBatch POSTs to /:id/cancel', async () => {
    mockInstance.post.mockResolvedValue({ data: { data: makeMockBatch() } });

    await service.cancelBatch('batch-99');

    expect(mockInstance.post).toHaveBeenCalledWith('/batch-99/cancel');
  });

  it('getInstance returns the same instance for same token', () => {
    const a = BatchesService.getInstance('token-abc');
    const b = BatchesService.getInstance('token-abc');
    expect(a).toBe(b);
  });

  it('getInstance returns different instances for different tokens', () => {
    const a = BatchesService.getInstance('token-1');
    const b = BatchesService.getInstance('token-2');
    expect(a).not.toBe(b);
  });
});
