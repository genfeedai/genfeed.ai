import { ServicesService } from '@services/external/services.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockInstance = {
  post: vi.fn(),
};

vi.mock('@services/core/base.service', () => ({
  BaseService: class MockBaseService {
    public instance = mockInstance;

    extractResource<T>(data: T): T {
      return data;
    }
  },
}));

describe('ServicesService authorized signals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInstance.post.mockResolvedValue({
      data: { id: 'credential-1' },
    });
  });

  it('posts TikTok authorized-signal refresh on the canonical route', async () => {
    const service = new ServicesService('tiktok', 'token');
    await service.refreshAuthorizedSignals('credential-1');

    expect(mockInstance.post).toHaveBeenCalledWith(
      'credential-1/authorized-signals/refresh',
    );
  });
});
