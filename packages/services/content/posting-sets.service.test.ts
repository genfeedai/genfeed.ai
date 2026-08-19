import { PostingSetsService } from '@services/content/posting-sets.service';
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

describe('PostingSetsService', () => {
  let service: PostingSetsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PostingSetsService('token');
  });

  it('posts expand against the canonical route', async () => {
    mockInstance.post.mockResolvedValue({
      data: { targets: [{ credentialId: 'cred_x' }] },
    });

    const result = await service.expand('set-1', {
      timezone: 'Europe/Malta',
    });

    expect(mockInstance.post).toHaveBeenCalledWith('/set-1/expand', {
      timezone: 'Europe/Malta',
    });
    expect(result.targets).toEqual([{ credentialId: 'cred_x' }]);
  });
});
