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

  it('requests Meta generated thumbnail selection for video creatives', async () => {
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
      video_id: 'video-1',
      video_thumbnail_id: '0',
      video_thumbnail_source: 'generated_default',
    });
    expect(data.status).toBe('PAUSED');
  });
});
