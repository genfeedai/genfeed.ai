import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BatchesService,
  type BatchListQuery,
  type CreateManualReviewBatchRequest,
} from './batches.service';

vi.mock('@services/core/interceptor.service', () => {
  return {
    HTTPBaseService: class {
      private static instances = new Map<string, unknown>();
      protected instance: {
        get: ReturnType<typeof vi.fn>;
        post: ReturnType<typeof vi.fn>;
        patch: ReturnType<typeof vi.fn>;
        delete: ReturnType<typeof vi.fn>;
      };
      constructor() {
        this.instance = {
          delete: vi.fn(),
          get: vi.fn(),
          patch: vi.fn(),
          post: vi.fn(),
        };
      }

      static getBaseServiceInstance<T>(
        ServiceClass: new (token: string) => T,
        token: string,
      ): T {
        const key = `${ServiceClass.name}:${token}`;
        const cached = this.instances.get(key);
        if (cached) {
          return cached as T;
        }

        const instance = new ServiceClass(token);
        this.instances.set(key, instance);
        return instance;
      }
    },
  };
});

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apiEndpoint: 'https://api.genfeed.ai',
  },
}));

vi.mock('@services/core/json-api', () => ({
  deserializeCollection: vi.fn((doc) => doc.data ?? []),
  deserializeResource: vi.fn((doc) => doc.data ?? doc),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

const makeMockBatch = (id = 'batch-1') => ({
  id,
  items: [],
  status: 'PENDING',
});

describe('BatchesService', () => {
  let service: BatchesService;
  let mockInstance: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    service = new BatchesService('test-token');
    mockInstance = (service as unknown as { instance: typeof mockInstance })
      .instance;
  });

  it('getBatches fetches from the API with query params', async () => {
    const query: BatchListQuery = { limit: 5 };
    mockInstance.get.mockResolvedValue({ data: { data: [makeMockBatch()] } });

    const result = await service.getBatches(query);

    expect(mockInstance.get).toHaveBeenCalledWith('', { params: query });
    expect(result).toBeDefined();
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

  it('cancelBatch PATCHes /:id with status cancelled', async () => {
    mockInstance.patch.mockResolvedValue({ data: { data: makeMockBatch() } });

    await service.cancelBatch('batch-99');

    expect(mockInstance.patch).toHaveBeenCalledWith('/batch-99', {
      status: 'CANCELLED',
    });
  });

  it('getInstance returns different instances for different tokens', () => {
    const a = BatchesService.getInstance('token-1');
    const b = BatchesService.getInstance('token-2');
    expect(a).not.toBe(b);
  });
});
