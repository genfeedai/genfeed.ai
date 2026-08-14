import { SourcePostsService } from '@services/social/source-posts.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockInstance = {
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

describe('SourcePostsService canonical identity contract', () => {
  let service: SourcePostsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SourcePostsService('token');
    mockInstance.post.mockResolvedValue({ data: {} });
  });

  it('uses brandId when creating a source-post draft', async () => {
    await service.createDraft(
      'source-post-1',
      { text: 'Draft this' },
      { brandId: 'brand-1' },
    );

    expect(mockInstance.post).toHaveBeenCalledWith(
      '/source-post-1/actions/draft',
      { text: 'Draft this' },
      { params: { brandId: 'brand-1' } },
    );
  });

  it('does not expose a native twitter action client (#2665)', () => {
    expect(service).not.toHaveProperty('publishTwitterAction');
  });
});
