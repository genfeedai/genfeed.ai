import { SocialSourcesService } from '@services/social/social-sources.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockInstance = {
  get: vi.fn(),
  post: vi.fn(),
};

vi.mock('@services/core/base.service', () => ({
  BaseService: class MockBaseService {
    public instance = mockInstance;

    static getDataServiceInstance<T>(
      ServiceClass: new (token: string) => T,
      token: string,
    ): T {
      return new ServiceClass(token);
    }
  },
}));

describe('SocialSourcesService canonical identity contract', () => {
  let service: SocialSourcesService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SocialSourcesService('token');
  });

  it('uses brandId and sourceId for the following feed query', async () => {
    mockInstance.get.mockResolvedValue({ data: { posts: [], sources: [] } });

    await service.getFollowingFeed({
      brandId: 'brand-1',
      sourceId: 'source-1',
    });

    expect(mockInstance.get).toHaveBeenCalledWith('/feed', {
      params: {
        brandId: 'brand-1',
        sourceId: 'source-1',
      },
    });
  });

  it('uses brandId when syncing one source or a brand', async () => {
    mockInstance.post.mockResolvedValue({ data: { count: 0 } });

    await service.syncSource('source-1', {
      brandId: 'brand-1',
      limit: 25,
    });
    await service.syncBrand({ brandId: 'brand-1', limit: 50 });

    expect(mockInstance.post).toHaveBeenNthCalledWith(
      1,
      '/source-1/sync',
      { limit: 25 },
      { params: { brandId: 'brand-1' } },
    );
    expect(mockInstance.post).toHaveBeenNthCalledWith(
      2,
      '/sync',
      { limit: 50 },
      { params: { brandId: 'brand-1' } },
    );
  });
});
