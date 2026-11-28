import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
} from '@services/__mocks__/http.mock';
import { OutlierLibraryService } from '@services/analytics/outlier-library.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('OutlierLibraryService', () => {
  let service: OutlierLibraryService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OutlierLibraryService('token');
  });

  it('getInstance caches per token', () => {
    const first = OutlierLibraryService.getInstance('tok');
    expect(OutlierLibraryService.getInstance('tok')).toBe(first);
  });

  it('listPosts GETs the library with its filters and reads the pagination', async () => {
    const http = installMockHttp(service);
    http.get.mockResolvedValue(
      axiosResponse(
        collectionDocument(
          [{ id: 'p1', outlierRatio: 12, platform: 'tiktok' }],
          { pagination: { limit: 50, page: 2, pages: 3, total: 120 } },
        ),
      ),
    );

    const result = await service.listPosts({
      page: 2,
      platform: 'tiktok',
      search: 'demo',
      tier: 'breakout',
    });

    expect(http.get).toHaveBeenCalledWith('', {
      params: { page: 2, platform: 'tiktok', search: 'demo', tier: 'breakout' },
      signal: undefined,
    });
    expect(result).toMatchObject({ limit: 50, page: 2, total: 120 });
    expect(result.docs[0]).toMatchObject({ id: 'p1', outlierRatio: 12 });
  });
});
