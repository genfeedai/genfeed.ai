import { API_ENDPOINTS } from '@genfeedai/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SavedAdsService } from './saved-ads.service';

type MockHttpClient = {
  delete: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

type TestableService = SavedAdsService & { instance: MockHttpClient };

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
    (service as TestableService).instance = http;

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
});
