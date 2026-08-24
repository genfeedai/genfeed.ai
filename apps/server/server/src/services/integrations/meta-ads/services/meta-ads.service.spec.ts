import type { LoggerService } from '@libs/logger/logger.service';
import type { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/integrations', () => ({
  IntegrationHttpClient: class IntegrationHttpClient {},
  getIntegrationProviderDefinition: () => ({
    endpoints: { apiBaseUrl: 'https://graph.facebook.com' },
  }),
}));

const { MetaAdsService } = await import('./meta-ads.service');

type MetaAdsServiceInstance = InstanceType<typeof MetaAdsService>;

type MetaAdsHttpParams = {
  toHttpServiceParams: (
    searchParams: URLSearchParams,
  ) => Record<string, string | number>;
};

type MetaAdsPrivateMethods = {
  listGraphPages: <T>(
    accessToken: string,
    path: string,
    params: Record<string, unknown>,
    allPages: boolean,
  ) => Promise<T[]>;
  makePostRequest: ReturnType<typeof vi.fn>;
  makeRequest: ReturnType<typeof vi.fn>;
};

function readHttpParams(
  service: MetaAdsServiceInstance,
  searchParams: URLSearchParams,
): Record<string, string | number> {
  return (service as unknown as MetaAdsHttpParams).toHttpServiceParams(
    searchParams,
  );
}

function createService(): {
  get: ReturnType<typeof vi.fn>;
  service: MetaAdsServiceInstance;
} {
  const get = vi.fn().mockReturnValue(of({ data: {}, status: 200 }));
  const httpService = {
    delete: vi.fn(),
    get,
    post: vi.fn(),
  } as unknown as HttpService;
  const loggerService = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;

  return {
    get,
    service: new MetaAdsService(httpService, loggerService),
  };
}

describe('MetaAdsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('toHttpServiceParams', () => {
    it('keeps Meta object IDs as strings even when they exceed MAX_SAFE_INTEGER', () => {
      const { service } = createService();
      const unsafeId = '9007199254740993';
      const params = readHttpParams(
        service,
        new URLSearchParams({
          account_id: unsafeId,
          adset_id: unsafeId,
          campaign_id: unsafeId,
          id: unsafeId,
        }),
      );

      expect(params.id).toBe(unsafeId);
      expect(params.account_id).toBe(unsafeId);
      expect(params.campaign_id).toBe(unsafeId);
      expect(params.adset_id).toBe(unsafeId);
    });

    it('coerces genuinely numeric fields and leaves non-numeric values as strings', () => {
      const { service } = createService();
      const params = readHttpParams(
        service,
        new URLSearchParams({
          daily_budget: '5000',
          name: 'Prospecting',
          age_min: '18',
        }),
      );

      expect(params.daily_budget).toBe(5000);
      expect(params.age_min).toBe(18);
      expect(params.name).toBe('Prospecting');
    });
  });

  it('uses exact server-side name filters for deterministic ad-object replay lookups', async () => {
    const { service } = createService();
    const privateMethods = service as unknown as MetaAdsPrivateMethods;
    privateMethods.makeRequest = vi.fn().mockResolvedValue({ data: [] });

    await service.listCampaigns('access-token', 'act-1', {
      limit: 1,
      name: 'Campaign name',
    });
    await service.listAdSets('access-token', 'act-1', 'campaign-1', {
      name: 'Ad set name',
    });
    await service.listAds('access-token', 'act-1', 'ad-set-1', {
      name: 'Ad name',
    });
    expect(privateMethods.makeRequest).toHaveBeenNthCalledWith(
      1,
      'access-token',
      'act-1/campaigns',
      expect.objectContaining({
        filtering: JSON.stringify([
          { field: 'name', operator: 'EQUAL', value: 'Campaign name' },
        ]),
        limit: 1,
      }),
    );
    expect(privateMethods.makeRequest).toHaveBeenNthCalledWith(
      2,
      'access-token',
      'campaign-1/adsets',
      expect.objectContaining({
        filtering: JSON.stringify([
          { field: 'name', operator: 'EQUAL', value: 'Ad set name' },
        ]),
      }),
    );
    expect(privateMethods.makeRequest).toHaveBeenNthCalledWith(
      3,
      'access-token',
      'ad-set-1/ads',
      expect.objectContaining({
        filtering: JSON.stringify([
          { field: 'name', operator: 'EQUAL', value: 'Ad name' },
        ]),
      }),
    );
  });

  it('preserves campaign and ad-set parent identifiers on list reads', async () => {
    const { service } = createService();
    const privateMethods = service as unknown as MetaAdsPrivateMethods;
    privateMethods.makeRequest = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            campaign_id: 'campaign-1',
            id: 'adset-1',
            name: 'Set A',
            status: 'ACTIVE',
          },
          {
            campaign_id: 'campaign-1',
            id: 'adset-2',
            name: 'Set B',
            status: 'PAUSED',
          },
        ],
      })
      .mockResolvedValueOnce({
        data: [
          {
            adset_id: 'adset-1',
            id: 'ad-1',
            name: 'Ad A',
            status: 'ACTIVE',
          },
          {
            adset_id: 'adset-2',
            id: 'ad-2',
            name: 'Ad B',
            status: 'PAUSED',
          },
        ],
      });

    await expect(
      service.listAdSets('access-token', 'act-1', 'campaign-1'),
    ).resolves.toEqual([
      {
        campaignId: 'campaign-1',
        id: 'adset-1',
        name: 'Set A',
        status: 'ACTIVE',
      },
      {
        campaignId: 'campaign-1',
        id: 'adset-2',
        name: 'Set B',
        status: 'PAUSED',
      },
    ]);
    await expect(service.listAds('access-token', 'act-1')).resolves.toEqual([
      {
        adSetId: 'adset-1',
        id: 'ad-1',
        name: 'Ad A',
        status: 'ACTIVE',
      },
      {
        adSetId: 'adset-2',
        id: 'ad-2',
        name: 'Ad B',
        status: 'PAUSED',
      },
    ]);
  });

  it('scans documented video pages for deterministic replay titles', async () => {
    const { service } = createService();
    const privateMethods = service as unknown as MetaAdsPrivateMethods;
    privateMethods.makeRequest = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ id: 'video-old', title: 'Older upload' }],
        paging: {
          cursors: { after: 'next-page' },
          next: 'https://graph.facebook.com/next-page',
        },
      })
      .mockResolvedValueOnce({
        data: [{ id: 'video-match', title: 'Video title' }],
      });

    await expect(
      service.listAdVideos('access-token', 'act-1', { allPages: true }),
    ).resolves.toEqual([
      { id: 'video-old', title: 'Older upload' },
      { id: 'video-match', title: 'Video title' },
    ]);
    expect(privateMethods.makeRequest).toHaveBeenNthCalledWith(
      1,
      'access-token',
      'act-1/advideos',
      { fields: 'id,title', limit: 200 },
    );
    expect(privateMethods.makeRequest).toHaveBeenNthCalledWith(
      2,
      'access-token',
      'act-1/advideos',
      { after: 'next-page', fields: 'id,title', limit: 200 },
    );
  });

  it('fails closed at the pagination safety limit instead of scanning forever', async () => {
    const { service } = createService();
    const privateMethods = service as unknown as MetaAdsPrivateMethods;
    let page = 0;
    privateMethods.makeRequest = vi.fn().mockImplementation(() => {
      page += 1;
      return Promise.resolve({
        data: [{ id: `campaign-${page}` }],
        paging: {
          cursors: { after: `cursor-${page}` },
          next: `https://graph.facebook.com/page/${page + 1}`,
        },
      });
    });

    await expect(
      privateMethods.listGraphPages<{ id: string }>(
        'access-token',
        'act-1/campaigns',
        { limit: 200 },
        true,
      ),
    ).rejects.toThrow('pagination exceeded the safe page limit');
    expect(privateMethods.makeRequest).toHaveBeenCalledTimes(25);
  });

  it('selects the preferred generated thumbnail returned by Meta', async () => {
    const { service } = createService();
    const privateMethods = service as unknown as MetaAdsPrivateMethods;
    privateMethods.makeRequest = vi.fn().mockResolvedValue({
      data: [
        { is_preferred: false, uri: 'https://meta.example/thumbnail-1.jpg' },
        { is_preferred: true, uri: 'https://meta.example/thumbnail-2.jpg' },
      ],
    });

    await expect(
      service.getAdVideoThumbnailUrl('access-token', 'video-1'),
    ).resolves.toBe('https://meta.example/thumbnail-2.jpg');
    expect(privateMethods.makeRequest).toHaveBeenCalledWith(
      'access-token',
      'video-1/thumbnails',
      { fields: 'is_preferred,uri', limit: 100 },
    );
  });

  it('waits for Meta video processing before selecting a generated thumbnail', async () => {
    vi.useFakeTimers();
    try {
      const { service } = createService();
      const privateMethods = service as unknown as MetaAdsPrivateMethods;
      privateMethods.makeRequest = vi
        .fn()
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({
          data: [
            {
              is_preferred: true,
              uri: 'https://meta.example/thumbnail-ready.jpg',
            },
          ],
        });

      const thumbnail = service.getAdVideoThumbnailUrl(
        'access-token',
        'video-1',
      );
      await vi.runAllTimersAsync();

      await expect(thumbnail).resolves.toBe(
        'https://meta.example/thumbnail-ready.jpg',
      );
      expect(privateMethods.makeRequest).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects an empty Meta image upload response with a recoverable error', async () => {
    const { service } = createService();
    const privateMethods = service as unknown as MetaAdsPrivateMethods;
    privateMethods.makePostRequest = vi.fn().mockResolvedValue({ images: {} });

    await expect(
      service.uploadAdImage(
        'access-token',
        'act-1',
        'https://cdn.example/image.jpg',
      ),
    ).rejects.toThrow('Meta did not return a usable uploaded image');
  });

  it('uses a Meta-returned thumbnail URL for video creatives', async () => {
    const { service } = createService();
    const privateMethods = service as unknown as MetaAdsPrivateMethods;
    privateMethods.makePostRequest = vi.fn().mockResolvedValue({ id: 'ad-1' });

    await service.createAd('access-token', 'act-1', {
      adSetId: 'ad-set-1',
      creative: {
        body: 'See how Acme works.',
        callToAction: 'LEARN_MORE',
        linkUrl: 'https://acme.example.test/offer',
        pageId: 'page-1',
        thumbnailUrl: 'https://meta.example/thumbnail.jpg',
        videoId: 'video-1',
      },
      name: 'Acme video ad',
    });

    const data = privateMethods.makePostRequest.mock.calls[0]?.[2] as Record<
      string,
      unknown
    >;
    const creative = JSON.parse(String(data.creative)) as {
      object_story_spec?: {
        video_data?: Record<string, unknown>;
      };
    };
    expect(creative.object_story_spec?.video_data).toMatchObject({
      image_url: 'https://meta.example/thumbnail.jpg',
      video_id: 'video-1',
    });
    expect(creative.object_story_spec?.video_data).not.toHaveProperty(
      'video_thumbnail_id',
    );
    expect(creative.object_story_spec?.video_data).not.toHaveProperty(
      'video_thumbnail_source',
    );
    expect(data.status).toBe('PAUSED');
  });
});
