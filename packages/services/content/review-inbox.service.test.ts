import { REVIEW_INBOX_BATCH_DECISION_MAX_ITEMS } from '@genfeedai/contracts/interfaces';
import { ReviewInboxService } from '@services/content/review-inbox.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock('@services/core/json-api', () => ({
  deserializeCollection: vi.fn((document: { data: unknown[] }) =>
    document.data.map((resource) => {
      const typed = resource as { id: string; attributes: object };
      return { id: typed.id, ...typed.attributes };
    }),
  ),
  deserializeResource: vi.fn((document: { data: unknown }) => {
    const typed = document.data as { id: string; attributes: object };
    return { id: typed.id, ...typed.attributes };
  }),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apiEndpoint: 'https://api.genfeed.ai/v1' },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

vi.mock('@services/core/interceptor.service', () => {
  class MockHTTPBaseService {
    protected instance = { get: mockGet, post: mockPost };
    constructor(
      public readonly baseURL: string,
      public readonly token: string,
    ) {}

    static getBaseServiceInstance<T, Args extends unknown[]>(
      ServiceClass: new (...args: Args) => T,
      ...args: Args
    ): T {
      return new ServiceClass(...args);
    }
  }

  return { HTTPBaseService: MockHTTPBaseService };
});

describe('ReviewInboxService', () => {
  let service: ReviewInboxService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = ReviewInboxService.getInstance('token');
  });

  it('targets the review inbox route', () => {
    expect((service as unknown as { baseURL: string }).baseURL).toBe(
      'https://api.genfeed.ai/v1/review-inbox',
    );
  });

  it('lists pending items with the caller signal', async () => {
    const controller = new AbortController();
    mockGet.mockResolvedValue({
      data: {
        data: [
          {
            attributes: { kind: 'mcp_approval', source: 'mcp_client' },
            id: 'mcp_approval:apr-1',
          },
        ],
      },
    });

    await expect(
      service.getPendingItems({ brandId: 'brand-1' }, controller.signal),
    ).resolves.toEqual([
      { id: 'mcp_approval:apr-1', kind: 'mcp_approval', source: 'mcp_client' },
    ]);
    expect(mockGet).toHaveBeenCalledWith('', {
      params: { brandId: 'brand-1' },
      signal: controller.signal,
    });
  });

  it('posts one decision and returns its result', async () => {
    mockPost.mockResolvedValue({
      data: {
        data: {
          attributes: { status: 'rejected' },
          id: 'workflow_review_gate:exec-1:gate-1',
        },
      },
    });

    await expect(
      service.decide({
        decision: 'reject',
        itemId: 'workflow_review_gate:exec-1:gate-1',
        reason: 'Off brand',
      }),
    ).resolves.toEqual({
      id: 'workflow_review_gate:exec-1:gate-1',
      status: 'rejected',
    });
    expect(mockPost).toHaveBeenCalledWith('/decisions', {
      decision: 'reject',
      itemId: 'workflow_review_gate:exec-1:gate-1',
      reason: 'Off brand',
    });
  });

  describe('decideMany', () => {
    const buildIds = (count: number): string[] =>
      Array.from({ length: count }, (_, index) => `mcp_approval:${index}`);

    it('posts one batch request for a selection within the cap', async () => {
      const itemIds = buildIds(2);
      mockPost.mockResolvedValue({
        data: {
          decided: itemIds.map((itemId) => ({ itemId })),
          failed: [],
        },
      });

      const result = await service.decideMany({ decision: 'approve', itemIds });

      expect(mockPost).toHaveBeenCalledTimes(1);
      expect(mockPost).toHaveBeenCalledWith('/decisions/batch', {
        decision: 'approve',
        itemIds,
      });
      expect(result.decided).toHaveLength(2);
      expect(result.failed).toEqual([]);
    });

    it('splits a larger selection into capped requests and merges the results', async () => {
      const itemIds = buildIds(REVIEW_INBOX_BATCH_DECISION_MAX_ITEMS + 1);
      mockPost.mockImplementation(
        async (_url: string, body: { itemIds: string[] }) => ({
          data: {
            decided: body.itemIds.map((itemId) => ({ itemId })),
            failed: [],
          },
        }),
      );

      const result = await service.decideMany({ decision: 'reject', itemIds });

      expect(mockPost).toHaveBeenCalledTimes(2);
      expect(mockPost.mock.calls[0][1].itemIds).toHaveLength(
        REVIEW_INBOX_BATCH_DECISION_MAX_ITEMS,
      );
      expect(mockPost.mock.calls[1][1].itemIds).toEqual([itemIds.at(-1)]);
      expect(result.decided).toHaveLength(itemIds.length);
    });

    it('marks a failed request as failed and keeps earlier results', async () => {
      const itemIds = buildIds(REVIEW_INBOX_BATCH_DECISION_MAX_ITEMS + 2);
      mockPost
        .mockResolvedValueOnce({
          data: {
            decided: itemIds
              .slice(0, REVIEW_INBOX_BATCH_DECISION_MAX_ITEMS)
              .map((itemId) => ({ itemId })),
            failed: [],
          },
        })
        .mockRejectedValueOnce(new Error('network down'));

      const result = await service.decideMany({ decision: 'approve', itemIds });

      expect(result.decided).toHaveLength(
        REVIEW_INBOX_BATCH_DECISION_MAX_ITEMS,
      );
      expect(result.failed).toEqual(
        itemIds
          .slice(REVIEW_INBOX_BATCH_DECISION_MAX_ITEMS)
          .map((itemId) => ({ itemId, message: 'network down' })),
      );
    });
  });
});
