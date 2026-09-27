import { BatchesService } from '@services/batch/batches.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock('@services/core/json-api', () => ({
  deserializeCollection: vi.fn(
    (document: { data: unknown[] }) => document.data,
  ),
  deserializeResource: vi.fn((document: { data: unknown }) => {
    const resource = document.data as
      | { id?: string; attributes?: Record<string, unknown> }
      | undefined;

    return {
      id: resource?.id,
      ...(resource?.attributes ?? {}),
    };
  }),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apiEndpoint: 'https://api.genfeed.ai/v1',
  },
}));

vi.mock('@services/core/interceptor.service', () => {
  class MockHTTPBaseService {
    protected instance = {
      get: mockGet,
      post: mockPost,
    };

    static getBaseServiceInstance<T, Args extends unknown[]>(
      ServiceClass: new (...args: Args) => T,
      ...args: Args
    ): T {
      return new ServiceClass(...args);
    }
  }

  return { HTTPBaseService: MockHTTPBaseService };
});

describe('BatchesService', () => {
  let service: BatchesService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BatchesService('test-token');
  });

  it('deserializes JSON:API batch collections', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: [{ attributes: { status: 'completed', totalCount: 3 }, id: '1' }],
      },
    });

    await expect(service.getBatches()).resolves.toEqual([
      { attributes: { status: 'completed', totalCount: 3 }, id: '1' },
    ]);
  });

  it('deserializes JSON:API batch resources', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          attributes: { status: 'completed', totalCount: 3 },
          id: 'batch-1',
        },
      },
    });

    await expect(service.getBatch('batch-1')).resolves.toEqual({
      id: 'batch-1',
      status: 'completed',
      totalCount: 3,
    });
  });

  it('deserializes item actions as resources', async () => {
    mockPost.mockResolvedValue({
      data: {
        data: {
          attributes: { status: 'PARTIAL' },
          id: 'batch-1',
        },
      },
    });

    await expect(
      service.itemAction('batch-1', {
        action: 'approve',
        itemIds: ['item-1'],
      }),
    ).resolves.toEqual({
      id: 'batch-1',
      status: 'PARTIAL',
    });
  });

  it('queues a rewrite job and returns without waiting for the rewrite', async () => {
    const job = { id: 'job-1', batchId: 'batch-1', status: 'queued' };
    mockPost.mockResolvedValue({ data: job });

    await expect(
      service.createRewriteJob('batch-1', ['item-1']),
    ).resolves.toEqual(job);
    expect(mockPost).toHaveBeenCalledWith('/batch-1/rewrite-jobs', {
      itemIds: ['item-1'],
    });
  });

  it('reads the active rewrite job of a batch', async () => {
    mockGet.mockResolvedValue({ data: { job: null } });

    await expect(service.getActiveRewriteJob('batch-1')).resolves.toBeNull();
    expect(mockGet).toHaveBeenCalledWith('/batch-1/rewrite-jobs/active', {
      signal: undefined,
    });
  });

  it('cancels a rewrite job', async () => {
    mockPost.mockResolvedValue({
      data: { id: 'job-1', isCancelRequested: true },
    });

    await expect(service.cancelRewriteJob('batch-1', 'job-1')).resolves.toEqual(
      { id: 'job-1', isCancelRequested: true },
    );
    expect(mockPost).toHaveBeenCalledWith('/batch-1/rewrite-jobs/job-1/cancel');
  });

  it('passes feedback through batch item actions', async () => {
    mockPost.mockResolvedValue({
      data: {
        data: {
          attributes: { status: 'completed' },
          id: 'batch-1',
        },
      },
    });

    await service.itemAction('batch-1', {
      action: 'request_changes',
      feedback: 'Needs a clearer CTA.',
      itemIds: ['item-1'],
    });

    expect(mockPost).toHaveBeenCalledWith('/batch-1/items/action', {
      action: 'request_changes',
      feedback: 'Needs a clearer CTA.',
      itemIds: ['item-1'],
    });
  });

  it('assigns and unassigns a single review item', async () => {
    mockPost.mockResolvedValue({
      data: {
        data: {
          attributes: { status: 'completed' },
          id: 'batch-1',
        },
      },
    });

    await service.assignItem('batch-1', 'item-1', 'user-1');
    expect(mockPost).toHaveBeenCalledWith('/batch-1/items/item-1/assign', {
      assigneeId: 'user-1',
    });

    await service.unassignItem('batch-1', 'item-1');
    expect(mockPost).toHaveBeenCalledWith('/batch-1/items/item-1/unassign');
  });
});
