import { BatchesService } from '@services/batch/batches.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock('@helpers/data/json-api/json-api.helper', () => ({
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

    static getBaseServiceInstance<T>(
      ServiceClass: new (...args: any[]) => T,
      ...args: any[]
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
          attributes: { status: 'partial' },
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
      status: 'partial',
    });
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
});
