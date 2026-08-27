import { RssSourcesService } from '@services/content/rss-sources.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockInstance = {
  delete: vi.fn(),
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
};

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apiEndpoint: 'https://api.test.com' },
}));

vi.mock('@services/core/interceptor.service', () => ({
  HTTPBaseService: class MockHttpBaseService {
    public instance = mockInstance;

    static getBaseServiceInstance<T>(
      ServiceClass: new (token: string) => T,
      token: string,
    ): T {
      return new ServiceClass(token);
    }
  },
}));

vi.mock('@services/core/json-api', () => ({
  extractCollection: (document: { items?: unknown[] }) => document.items ?? [],
  extractResource: (document: { item?: unknown }) => document.item,
}));

describe('RssSourcesService', () => {
  let service: RssSourcesService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RssSourcesService('token');
  });

  it('posts poll against the canonical route', async () => {
    mockInstance.post.mockResolvedValue({
      data: { item: { id: 'rss-1', lastError: null } },
    });

    const result = await service.pollNow('rss-1');

    expect(mockInstance.post).toHaveBeenCalledWith(
      '/rss-1/poll',
      {},
      { signal: undefined },
    );
    expect(result).toEqual({ id: 'rss-1', lastError: null });
  });
});
