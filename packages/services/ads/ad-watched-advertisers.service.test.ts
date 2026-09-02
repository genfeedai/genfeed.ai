import type { AdWatchedAdvertiser } from '@genfeedai/contracts/interfaces';
import { AdWatchedAdvertisersService } from '@services/ads/ad-watched-advertisers.service';
import type { JsonApiResponseDocument } from '@services/core/json-api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockHttpClient = {
  delete: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

type TestableService = AdWatchedAdvertisersService & {
  instance: MockHttpClient;
};

function createService(): {
  http: MockHttpClient;
  service: AdWatchedAdvertisersService;
} {
  const service = new AdWatchedAdvertisersService('test-token');
  const http: MockHttpClient = {
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
  };
  (service as TestableService).instance = http;

  return { http, service };
}

function toDocument(
  attributes: Record<string, unknown>,
): JsonApiResponseDocument {
  return {
    data: {
      attributes,
      id: 'watched-1',
      type: 'ad-watched-advertisers',
    },
  } as unknown as JsonApiResponseDocument;
}

describe('AdWatchedAdvertisersService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists watched competitors scoped to a brand (#3537)', async () => {
    const { http, service } = createService();
    http.get.mockResolvedValue({
      data: {
        data: [
          {
            attributes: {
              advertiserHandle: 'nike',
              advertiserName: 'Nike',
              freshnessState: 'fresh',
              lastSnapshotRecordCount: 12,
              platform: 'meta',
            },
            id: 'watched-1',
            type: 'ad-watched-advertisers',
          },
        ],
      },
    });

    const result = await service.list({ brandId: 'brand-1' });

    expect(http.get).toHaveBeenCalledWith('', {
      params: { brandId: 'brand-1' },
    });
    expect(result).toEqual([
      {
        advertiserHandle: 'nike',
        advertiserName: 'Nike',
        freshnessState: 'fresh',
        id: 'watched-1',
        lastSnapshotRecordCount: 12,
        platform: 'meta',
      },
    ] satisfies AdWatchedAdvertiser[]);
  });

  it('omits an absent brand rather than sending an empty filter (#3537)', async () => {
    const { http, service } = createService();
    http.get.mockResolvedValue({ data: { data: [] } });

    await service.list({});

    expect(http.get).toHaveBeenCalledWith('', { params: {} });
  });

  it('creates a watched competitor from a handle and platform (#3537)', async () => {
    const { http, service } = createService();
    http.post.mockResolvedValue({
      data: toDocument({
        advertiserHandle: 'gymshark',
        freshnessState: 'unavailable',
        platform: 'tiktok',
      }),
    });

    const result = await service.create({
      advertiserHandle: 'gymshark',
      brandId: 'brand-1',
      platform: 'tiktok',
    });

    expect(http.post).toHaveBeenCalledWith('', {
      advertiserHandle: 'gymshark',
      brandId: 'brand-1',
      platform: 'tiktok',
    });
    expect(result.id).toBe('watched-1');
    expect(result.freshnessState).toBe('unavailable');
  });

  it('removes a watched competitor by id (#3537)', async () => {
    const { http, service } = createService();
    http.delete.mockResolvedValue({ data: toDocument({}) });

    await service.remove('watched-1');

    expect(http.delete).toHaveBeenCalledWith('/watched-1');
  });
});
