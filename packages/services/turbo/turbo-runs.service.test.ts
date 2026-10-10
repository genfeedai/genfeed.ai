import { TurboRunsService } from '@services/turbo/turbo-runs.service';
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

describe('TurboRunsService', () => {
  let service: TurboRunsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TurboRunsService('test-token');
  });

  it('deserializes JSON:API run collections', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: [{ attributes: { status: 'completed', totalCount: 3 }, id: '1' }],
      },
    });

    await expect(service.getTurboRuns()).resolves.toEqual([
      { attributes: { status: 'completed', totalCount: 3 }, id: '1' },
    ]);
  });

  it('deserializes JSON:API run resources', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          attributes: { status: 'completed', totalCount: 3 },
          id: 'run-1',
        },
      },
    });

    await expect(service.getTurboRun('run-1')).resolves.toEqual({
      id: 'run-1',
      status: 'completed',
      totalCount: 3,
    });
  });

  it('deserializes item actions as resources', async () => {
    mockPost.mockResolvedValue({
      data: {
        data: {
          attributes: { status: 'PARTIAL' },
          id: 'run-1',
        },
      },
    });

    await expect(
      service.itemAction('run-1', {
        action: 'approve',
        itemIds: ['item-1'],
      }),
    ).resolves.toEqual({
      id: 'run-1',
      status: 'PARTIAL',
    });
  });

  it('queues a rewrite job and returns without waiting for the rewrite', async () => {
    const job = { id: 'job-1', turboRunId: 'run-1', status: 'queued' };
    mockPost.mockResolvedValue({ data: job });

    await expect(
      service.createRewriteJob('run-1', ['item-1']),
    ).resolves.toEqual(job);
    expect(mockPost).toHaveBeenCalledWith('/run-1/rewrite-jobs', {
      itemIds: ['item-1'],
    });
  });

  it('reads the active rewrite job of a run', async () => {
    mockGet.mockResolvedValue({ data: { job: null } });

    await expect(service.getActiveRewriteJob('run-1')).resolves.toBeNull();
    expect(mockGet).toHaveBeenCalledWith('/run-1/rewrite-jobs/active', {
      signal: undefined,
    });
  });

  it('cancels a rewrite job', async () => {
    mockPost.mockResolvedValue({
      data: { id: 'job-1', isCancelRequested: true },
    });

    await expect(service.cancelRewriteJob('run-1', 'job-1')).resolves.toEqual(
      { id: 'job-1', isCancelRequested: true },
    );
    expect(mockPost).toHaveBeenCalledWith('/run-1/rewrite-jobs/job-1/cancel');
  });

  it('passes feedback through run item actions', async () => {
    mockPost.mockResolvedValue({
      data: {
        data: {
          attributes: { status: 'completed' },
          id: 'run-1',
        },
      },
    });

    await service.itemAction('run-1', {
      action: 'request_changes',
      feedback: 'Needs a clearer CTA.',
      itemIds: ['item-1'],
    });

    expect(mockPost).toHaveBeenCalledWith('/run-1/items/action', {
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
          id: 'run-1',
        },
      },
    });

    await service.assignItem('run-1', 'item-1', 'user-1');
    expect(mockPost).toHaveBeenCalledWith('/run-1/items/item-1/assign', {
      assigneeId: 'user-1',
    });

    await service.unassignItem('run-1', 'item-1');
    expect(mockPost).toHaveBeenCalledWith('/run-1/items/item-1/unassign');
  });
});
