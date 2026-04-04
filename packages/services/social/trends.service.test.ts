import { deserializeCollection } from '@helpers/data/json-api/json-api.helper';
import { TrendsService } from '@services/social/trends.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@helpers/data/json-api/json-api.helper', () => ({
  deserializeCollection: vi.fn(),
}));

vi.mock('@services/core/base.service', () => {
  class MockBaseService {
    public instance = {
      get: vi.fn(),
      post: vi.fn(),
    };

    public findAll = vi.fn();
    public findOne = vi.fn();
    public post = vi.fn();
    public patch = vi.fn();
    public delete = vi.fn();

    constructor(
      protected endpoint: string,
      protected token: string,
    ) {
      void endpoint;
      void token;
    }

    static getDataServiceInstance = vi.fn();
  }

  return { BaseService: MockBaseService };
});

describe('TrendsService', () => {
  let service: TrendsService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TrendsService(mockToken);
  });

  it('initializes correctly', () => {
    expect(service).toBeInstanceOf(TrendsService);
  });

  it('has CRUD methods', () => {
    expect(service.findAll).toBeDefined();
    expect(service.findOne).toBeDefined();
    expect(service.post).toBeDefined();
    expect(service.patch).toBeDefined();
    expect(service.delete).toBeDefined();
  });

  it('getTrendsDiscovery uses the discovery endpoint', async () => {
    const getSpy = vi
      .spyOn((service as any).instance, 'get')
      .mockResolvedValueOnce({
        data: {
          summary: {
            connectedPlatforms: ['twitter'],
            lockedPlatforms: [],
            totalTrends: 1,
          },
          trends: [{ id: 'trend-1' }],
        },
      });

    const result = await service.getTrendsDiscovery({
      platform: 'twitter',
      refresh: true,
    });

    expect(getSpy).toHaveBeenCalledWith('/discovery', {
      params: {
        platform: 'twitter',
        refresh: 'true',
      },
    });
    expect(result.summary.totalTrends).toBe(1);
  });

  it('refreshTrends posts to the refresh endpoint', async () => {
    const postSpy = vi
      .spyOn((service as any).instance, 'post')
      .mockResolvedValueOnce({
        data: {
          count: 3,
          message: 'refreshed',
          success: true,
        },
      });

    const result = await service.refreshTrends();

    expect(postSpy).toHaveBeenCalledWith('/refresh');
    expect(result).toEqual({
      count: 3,
      message: 'refreshed',
      success: true,
    });
  });

  it('getTrendSources uses the sources endpoint', async () => {
    const getSpy = vi
      .spyOn((service as any).instance, 'get')
      .mockResolvedValueOnce({
        data: {
          items: [{ id: 'source-1', platform: 'instagram' }],
        },
      });

    const result = await service.getTrendSources('trend-1', 3);

    expect(getSpy).toHaveBeenCalledWith('/trend-1/sources', {
      params: {
        limit: 3,
      },
    });
    expect(result).toEqual([{ id: 'source-1', platform: 'instagram' }]);
  });

  it('getTrendContent uses the content endpoint', async () => {
    const getSpy = vi
      .spyOn((service as any).instance, 'get')
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: 'source-1',
              sourceReferenceId: 'ref-1',
            },
          ],
          summary: {
            connectedPlatforms: ['twitter'],
            lockedPlatforms: [],
            totalItems: 1,
            totalTrends: 1,
          },
        },
      });

    const result = await service.getTrendContent({
      limit: 5,
      platform: 'twitter',
      refresh: true,
    });

    expect(getSpy).toHaveBeenCalledWith('/content', {
      params: {
        limit: 5,
        platform: 'twitter',
        refresh: 'true',
      },
    });
    expect(result.items[0]?.sourceReferenceId).toBe('ref-1');
  });

  it('getTrendingTopics deserializes the JSON:API trends collection', async () => {
    const jsonApiDocument = {
      data: [
        {
          attributes: {
            growthRate: 10,
            mentions: 100,
            platform: 'twitter',
            topic: 'AI',
            viralityScore: 80,
          },
          id: 'trend-1',
          type: 'trends',
        },
      ],
    };

    vi.spyOn((service as any).instance, 'get').mockResolvedValueOnce({
      data: jsonApiDocument,
    });
    const deserializeCollectionMock = deserializeCollection as ReturnType<
      typeof vi.fn
    >;
    deserializeCollectionMock.mockReturnValue([
      {
        growthRate: 10,
        mentions: 100,
        platform: 'twitter',
        topic: 'AI',
        viralityScore: 80,
      },
    ]);

    const result = await service.getTrendingTopics();

    expect(deserializeCollection).toHaveBeenCalledWith(jsonApiDocument);
    expect(result).toEqual([
      {
        growthRate: 10,
        mentions: 100,
        platform: 'twitter',
        topic: 'AI',
        viralityScore: 80,
      },
    ]);
  });
});
