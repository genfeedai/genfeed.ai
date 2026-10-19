import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import { collectionDocument } from '@services/__mocks__/http.mock';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SavedAdsService } from './saved-ads.service';

type MockHttpClient = {
  delete: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

type TestableService = { instance: MockHttpClient };

describe('SavedAdsService client', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('uses array payloads for every public mutation', async () => {
    const service = new SavedAdsService('token');
    const http: MockHttpClient = {
      delete: vi.fn().mockResolvedValue({ data: { data: [] } }),
      get: vi.fn(),
      patch: vi.fn().mockResolvedValue({ data: { data: [] } }),
      post: vi.fn().mockResolvedValue({ data: { data: [] } }),
    };
    (service as unknown as TestableService).instance = http;

    await service.save([
      { adId: 'ad-1', brandId: 'brand-1', source: 'public' },
    ]);
    await service.updateNotes([
      { brandId: 'brand-1', id: 'saved-1', note: 'Keep hook' },
    ]);
    await service.unsave([{ brandId: 'brand-1', id: 'saved-1' }]);

    expect(API_ENDPOINTS.SAVED_ADS).toBe('/saved-ads');
    expect(http.post).toHaveBeenCalledWith('', [expect.any(Object)]);
    expect(http.patch).toHaveBeenCalledWith('', [expect.any(Object)]);
    expect(http.delete).toHaveBeenCalledWith('', {
      data: [expect.any(Object)],
    });
  });

  it("walks every page of a brand's saved ads", async () => {
    const service = new SavedAdsService('token');
    const document = (id: string, page: number) => ({
      data: {
        ...collectionDocument([{ brandId: 'brand-1', id }]),
        links: { pagination: { limit: 100, page, pages: 2, total: 101 } },
      },
    });
    const http: MockHttpClient = {
      delete: vi.fn(),
      get: vi
        .fn()
        .mockResolvedValueOnce(document('saved-1', 1))
        .mockResolvedValueOnce(document('saved-2', 2)),
      patch: vi.fn(),
      post: vi.fn(),
    };
    (service as unknown as TestableService).instance = http;

    const savedAds = await service.list('brand-1');

    expect(savedAds.map((ad) => ad.id)).toEqual(['saved-1', 'saved-2']);
    expect(http.get).toHaveBeenNthCalledWith(2, '', {
      params: { brandId: 'brand-1', limit: 100, page: 2 },
      signal: undefined,
    });
  });
});
