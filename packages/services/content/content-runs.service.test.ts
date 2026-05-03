import { ContentRunsService } from '@services/content/content-runs.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDeserializeResource, mockPost } = vi.hoisted(() => ({
  mockDeserializeResource: vi.fn(),
  mockPost: vi.fn(),
}));

vi.mock('@genfeedai/helpers/data/json-api/json-api.helper', () => ({
  deserializeResource: mockDeserializeResource,
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apiEndpoint: 'https://api.genfeed.ai/v1',
  },
}));

vi.mock('@services/core/interceptor.service', () => {
  class MockHTTPBaseService {
    protected instance = {
      post: mockPost,
    };

    constructor(
      protected readonly baseURL: string,
      protected readonly token: string,
    ) {}

    static getBaseServiceInstance<T>(
      ServiceClass: new (...args: unknown[]) => T,
      ...args: unknown[]
    ): T {
      return new ServiceClass(...args);
    }
  }

  return { HTTPBaseService: MockHTTPBaseService };
});

describe('ContentRunsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts research brief handoffs to the brand content-runs endpoint', async () => {
    mockPost.mockResolvedValue({
      data: {
        data: {
          attributes: {
            brief: {
              evidence: ['Source text'],
              sourceUrl: 'https://x.com/builderx/status/1',
            },
            skillSlug: 'trend-remix',
            status: 'pending',
          },
          id: 'run-1',
          type: 'content-runs',
        },
      },
    });
    mockDeserializeResource.mockReturnValue({
      _id: 'run-1',
      brief: {
        evidence: ['Source text'],
        sourceUrl: 'https://x.com/builderx/status/1',
      },
      skillSlug: 'trend-remix',
      status: 'pending',
    });

    const service = new ContentRunsService('token');
    const result = await service.createResearchBriefRun('brand-1', {
      evidence: ['Source text'],
      platform: 'twitter',
      sourceUrl: 'https://x.com/builderx/status/1',
      trendId: 'trend-1',
      trendTopic: '#AIAgents',
    });

    expect(mockPost).toHaveBeenCalledWith(
      '/brands/brand-1/content-runs/briefs',
      {
        evidence: ['Source text'],
        platform: 'twitter',
        sourceUrl: 'https://x.com/builderx/status/1',
        trendId: 'trend-1',
        trendTopic: '#AIAgents',
      },
    );
    expect(result).toMatchObject({
      _id: 'run-1',
      brief: {
        evidence: ['Source text'],
        sourceUrl: 'https://x.com/builderx/status/1',
      },
    });
  });
});
