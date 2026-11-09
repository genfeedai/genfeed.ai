import { AdminCommunityService } from '@services/admin/community.service';
import { describe, expect, it, vi } from 'vitest';

const requests = vi.hoisted(() => ({ sent: [] as string[] }));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apiEndpoint: 'https://api.genfeed.ai/v1' },
}));

vi.mock('@services/core/interceptor.service', () => {
  function record(method: string) {
    return async (path: string, config?: { params?: { page?: number } }) => {
      const page = config?.params?.page;
      requests.sent.push(
        page === undefined
          ? `${method} ${path}`
          : `${method} ${path}?page=${page}`,
      );
      return {
        data: { data: { creators: [], media: [], mediaTotal: 0 } },
      };
    };
  }

  class MockHTTPBaseService {
    protected instance = {
      delete: record('DELETE'),
      get: record('GET'),
      put: record('PUT'),
    };

    static getBaseServiceInstance<T>(
      ServiceClass: new (...args: never[]) => T,
      ...args: never[]
    ): T {
      return new ServiceClass(...args);
    }
  }

  return { HTTPBaseService: MockHTTPBaseService };
});

describe('AdminCommunityService', () => {
  it('reads one organization and curates its creators and media', async () => {
    requests.sent = [];
    const service = new AdminCommunityService('test-token');

    await expect(service.getOverview('org-1', 2)).resolves.toEqual({
      creators: [],
      media: [],
      mediaTotal: 0,
    });
    await service.setFeatured('org-1', 'creators', 'brand-1', true);
    await service.setFeatured('org-1', 'media', 'video-1', false);
    await service.unpublish('org-1', 'media', 'video-1');
    await service.unpublish('org-1', 'creators', 'brand-1');

    expect(requests.sent).toEqual([
      'GET org-1/community?page=2',
      'PUT org-1/community/creators/brand-1/featured',
      'DELETE org-1/community/media/video-1/featured',
      'DELETE org-1/community/media/video-1',
      'DELETE org-1/community/creators/brand-1',
    ]);
  });
});
