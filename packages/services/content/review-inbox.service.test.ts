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

    await expect(service.getPendingItems(controller.signal)).resolves.toEqual([
      { id: 'mcp_approval:apr-1', kind: 'mcp_approval', source: 'mcp_client' },
    ]);
    expect(mockGet).toHaveBeenCalledWith('', { signal: controller.signal });
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
});
