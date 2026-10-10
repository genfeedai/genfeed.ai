import { logger } from '@services/core/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type CreateManualReviewTurboRunRequest,
  type TurboRunActionRequest,
  type TurboRunListQuery,
  TurboRunsService,
} from './turbo-runs.service';

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
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const makeMockTurboRun = (id = 'run-1') => ({
  id,
  items: [],
  status: 'PENDING',
});

describe('TurboRunsService', () => {
  let service: TurboRunsService;
  let mockInstance: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TurboRunsService('test-token');
    mockInstance = (service as unknown as { instance: typeof mockInstance })
      .instance;
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  it('getTurboRuns fetches from the API with query params', async () => {
    const query: TurboRunListQuery = { limit: 5 };
    mockInstance.get.mockResolvedValue({
      data: { data: [makeMockTurboRun()] },
    });

    const result = await service.getTurboRuns(query);

    expect(mockInstance.get).toHaveBeenCalledWith('', { params: query });
    expect(result).toBeDefined();
  });

  it('getTurboRuns works without query params', async () => {
    mockInstance.get.mockResolvedValue({ data: { data: [] } });

    await service.getTurboRuns();

    expect(mockInstance.get).toHaveBeenCalledWith('', { params: undefined });
  });

  it('getTurboRuns throws and logs on error', async () => {
    mockInstance.get.mockRejectedValue(new Error('network error'));

    await expect(service.getTurboRuns()).rejects.toThrow('network error');
  });

  it('preserves a subscription denial without reporting an application error', async () => {
    const error = {
      errors: [{ status: '403', title: 'Active subscription required' }],
    };
    mockInstance.get.mockRejectedValue(error);
    await expect(service.getTurboRuns()).rejects.toBe(error);
    expect(logger.warn).toHaveBeenCalledWith('GET /turbo-runs denied', {
      status: 403,
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('continues logging genuine run API failures', async () => {
    const error = {
      errors: [{ status: '500', title: 'Internal Server Error' }],
    };
    mockInstance.get.mockRejectedValue(error);
    await expect(service.getTurboRuns()).rejects.toBe(error);
    expect(logger.error).toHaveBeenCalledWith('GET /turbo-runs failed', error);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('getTurboRun fetches a single run by id', async () => {
    mockInstance.get.mockResolvedValue({
      data: { data: makeMockTurboRun('run-42') },
    });

    const result = await service.getTurboRun('run-42');

    expect(mockInstance.get).toHaveBeenCalledWith('/run-42');
    expect(result).toBeDefined();
  });

  it('createManualReviewTurboRun POSTs to /manual-review', async () => {
    const req: CreateManualReviewTurboRunRequest = {
      brandId: 'brand-1',
      items: [{ format: 'video', mediaUrl: 'https://example.com/video.mp4' }],
    };
    mockInstance.post.mockResolvedValue({ data: { data: makeMockTurboRun() } });

    const result = await service.createManualReviewTurboRun(req);

    expect(mockInstance.post).toHaveBeenCalledWith('/manual-review', req);
    expect(result).toBeDefined();
  });

  it('createManualReviewTurboRun throws and logs on error', async () => {
    mockInstance.post.mockRejectedValue(new Error('validation error'));

    await expect(
      service.createManualReviewTurboRun({ brandId: 'b', items: [] }),
    ).rejects.toThrow('validation error');
  });

  it('itemAction POSTs to /:turboRunId/items/action', async () => {
    const req: TurboRunActionRequest = {
      action: 'approve',
      itemIds: ['item-1', 'item-2'],
    };
    mockInstance.post.mockResolvedValue({ data: { data: makeMockTurboRun() } });

    await service.itemAction('run-1', req);

    expect(mockInstance.post).toHaveBeenCalledWith('/run-1/items/action', req);
  });

  it('assignItem POSTs to /:turboRunId/items/:itemId/assign', async () => {
    mockInstance.post.mockResolvedValue({ data: { data: makeMockTurboRun() } });

    await service.assignItem('run-1', 'item-1', 'user-1');

    expect(mockInstance.post).toHaveBeenCalledWith(
      '/run-1/items/item-1/assign',
      { assigneeId: 'user-1' },
    );
  });

  it('unassignItem POSTs to /:turboRunId/items/:itemId/unassign', async () => {
    mockInstance.post.mockResolvedValue({ data: { data: makeMockTurboRun() } });

    await service.unassignItem('run-1', 'item-1');

    expect(mockInstance.post).toHaveBeenCalledWith(
      '/run-1/items/item-1/unassign',
    );
  });

  it('cancelTurboRun PATCHes /:id with status cancelled', async () => {
    mockInstance.patch.mockResolvedValue({
      data: { data: makeMockTurboRun() },
    });

    await service.cancelTurboRun('run-99');

    expect(mockInstance.patch).toHaveBeenCalledWith('/run-99', {
      status: 'CANCELLED',
    });
  });

  it('getInstance returns the same instance for same token', () => {
    const a = TurboRunsService.getInstance('token-abc');
    const b = TurboRunsService.getInstance('token-abc');
    expect(a).toBe(b);
  });

  it('getInstance returns different instances for different tokens', () => {
    const a = TurboRunsService.getInstance('token-1');
    const b = TurboRunsService.getInstance('token-2');
    expect(a).not.toBe(b);
  });
});
