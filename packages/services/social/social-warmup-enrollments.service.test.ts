import { SocialWarmupEnrollmentsService } from '@services/social/social-warmup-enrollments.service';
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

    extractResource<T>(data: T): T {
      return data;
    }
  },
}));

describe('SocialWarmupEnrollmentsService', () => {
  let service: SocialWarmupEnrollmentsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SocialWarmupEnrollmentsService('token');
  });

  it('posts enrollments and checklist actions on the canonical routes', async () => {
    mockInstance.post.mockResolvedValue({
      data: { credentialId: 'credential-1', id: 'enrollment-1' },
    });

    await service.enroll({ credentialId: 'credential-1' });
    await service.completeItem('enrollment-1', 'watch-niche-content');
    await service.reopenItem('enrollment-1', 'watch-niche-content');

    expect(mockInstance.post).toHaveBeenNthCalledWith(1, '/', {
      credentialId: 'credential-1',
    });
    expect(mockInstance.post).toHaveBeenNthCalledWith(
      2,
      '/enrollment-1/items/watch-niche-content/complete',
      {},
    );
    expect(mockInstance.post).toHaveBeenNthCalledWith(
      3,
      '/enrollment-1/items/watch-niche-content/reopen',
      {},
    );
  });
});
