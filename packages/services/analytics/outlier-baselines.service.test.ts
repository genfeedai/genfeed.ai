import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { OutlierBaselinesService } from '@services/analytics/outlier-baselines.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('OutlierBaselinesService', () => {
  let service: OutlierBaselinesService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OutlierBaselinesService('token');
  });

  it('getInstance caches per token', () => {
    const first = OutlierBaselinesService.getInstance('tok');
    expect(OutlierBaselinesService.getInstance('tok')).toBe(first);
  });

  it('listPosts GETs ranked performances with pagination', async () => {
    const http = installMockHttp(service);
    http.get.mockResolvedValue(
      axiosResponse(
        collectionDocument(
          [{ id: 'p1', outlierRatio: 10, platform: 'twitter' }],
          { pagination: { limit: 20, page: 1, pages: 1, total: 1 } },
        ),
      ),
    );
    const result = await service.listPosts({
      brandId: 'brand',
      platform: 'twitter',
    });
    expect(http.get).toHaveBeenCalledWith('posts', {
      params: { brandId: 'brand', platform: 'twitter' },
      signal: undefined,
    });
    expect(result).toMatchObject({
      total: 1,
      docs: [expect.objectContaining({ outlierRatio: 10 })],
    });
  });

  it('getSnapshot GETs one authorized snapshot', async () => {
    const http = installMockHttp(service);
    http.get.mockResolvedValue(
      axiosResponse(
        resourceDocument({ medianViews: 30000, status: 'ready' }, { id: 's1' }),
      ),
    );
    const result = await service.getSnapshot('s1');
    expect(http.get).toHaveBeenCalledWith('s1', { signal: undefined });
    expect(result).toMatchObject({ medianViews: 30000, status: 'ready' });
  });
});
