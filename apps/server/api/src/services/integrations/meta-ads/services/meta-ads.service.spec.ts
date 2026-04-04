import { ConfigService } from '@api/config/config.service';
import type {
  MetaAdAccount,
  MetaAdCreative,
  MetaCampaign,
  MetaCampaignComparison,
  MetaInsightsData,
  MetaInsightsParams,
  MetaTopPerformer,
} from '@api/services/integrations/meta-ads/interfaces/meta-ads.interface';
import { MetaAdsService } from '@api/services/integrations/meta-ads/services/meta-ads.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';

describe('MetaAdsService', () => {
  let service: MetaAdsService;
  let httpService: vi.Mocked<HttpService>;
  let loggerService: vi.Mocked<LoggerService>;

  const mockAccessToken = 'EAABsbCS1iHgBO0ZCtest';

  beforeEach(async () => {
    const mockConfigService = {
      get: vi.fn(),
    };

    const mockHttpService = {
      get: vi.fn(),
      post: vi.fn(),
    };

    const mockLoggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetaAdsService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: HttpService, useValue: mockHttpService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    service = module.get<MetaAdsService>(MetaAdsService);
    httpService = module.get(HttpService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAdAccounts', () => {
    it('should return mapped ad accounts', async () => {
      const apiResponse = {
        data: [
          {
            account_id: '123456789',
            account_status: 1,
            currency: 'USD',
            id: 'act_123456789',
            name: 'My Ad Account',
            timezone_name: 'America/New_York',
          },
          {
            account_id: '987654321',
            account_status: 2,
            currency: 'EUR',
            id: 'act_987654321',
            name: 'EU Account',
            timezone_name: 'Europe/Berlin',
          },
        ],
      };

      httpService.get.mockReturnValue(
        of({
          config: {} as never,
          data: apiResponse,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      const result: MetaAdAccount[] =
        await service.getAdAccounts(mockAccessToken);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        accountId: '123456789',
        currency: 'USD',
        id: 'act_123456789',
        name: 'My Ad Account',
        status: 1,
        timezone: 'America/New_York',
      });
      expect(result[1]).toEqual({
        accountId: '987654321',
        currency: 'EUR',
        id: 'act_987654321',
        name: 'EU Account',
        status: 2,
        timezone: 'Europe/Berlin',
      });

      expect(httpService.get).toHaveBeenCalledWith(
        expect.stringContaining('graph.facebook.com/v24.0/me/adaccounts'),
        expect.objectContaining({
          params: expect.objectContaining({
            access_token: mockAccessToken,
            fields: 'id,name,account_id,currency,timezone_name,account_status',
            limit: 100,
          }),
          timeout: 30000,
        }),
      );
    });

    it('should return empty array when no ad accounts exist', async () => {
      httpService.get.mockReturnValue(
        of({
          config: {} as never,
          data: { data: [] },
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      const result = await service.getAdAccounts(mockAccessToken);

      expect(result).toEqual([]);
    });

    it('should throw and log error on API failure', async () => {
      httpService.get.mockReturnValue(
        throwError(() => new Error('Graph API error')),
      );

      await expect(service.getAdAccounts(mockAccessToken)).rejects.toThrow(
        'Graph API error',
      );
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('listCampaigns', () => {
    it('should return mapped campaigns', async () => {
      const apiResponse = {
        data: [
          {
            daily_budget: '5000',
            id: '120001',
            lifetime_budget: undefined,
            name: 'Summer Campaign',
            objective: 'LINK_CLICKS',
            start_time: '2024-06-01T00:00:00+0000',
            status: 'ACTIVE',
            stop_time: '2024-08-31T23:59:59+0000',
          },
        ],
      };

      httpService.get.mockReturnValue(
        of({
          config: {} as never,
          data: apiResponse,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      const result: MetaCampaign[] = await service.listCampaigns(
        mockAccessToken,
        'act_123',
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        dailyBudget: 50, // 5000 / 100
        id: '120001',
        lifetimeBudget: undefined,
        name: 'Summer Campaign',
        objective: 'LINK_CLICKS',
        startTime: '2024-06-01T00:00:00+0000',
        status: 'ACTIVE',
        stopTime: '2024-08-31T23:59:59+0000',
      });
    });

    it('should convert lifetime_budget to number divided by 100', async () => {
      const apiResponse = {
        data: [
          {
            daily_budget: undefined,
            id: '120002',
            lifetime_budget: '100000',
            name: 'Lifetime Campaign',
            objective: 'CONVERSIONS',
            status: 'PAUSED',
          },
        ],
      };

      httpService.get.mockReturnValue(
        of({
          config: {} as never,
          data: apiResponse,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      const result = await service.listCampaigns(mockAccessToken, 'act_123');

      expect(result[0].lifetimeBudget).toBe(1000); // 100000 / 100
      expect(result[0].dailyBudget).toBeUndefined();
    });

    it('should apply status filter when provided', async () => {
      httpService.get.mockReturnValue(
        of({
          config: {} as never,
          data: { data: [] },
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      await service.listCampaigns(mockAccessToken, 'act_123', {
        status: 'ACTIVE',
      });

      const params = httpService.get.mock.calls[0][1]?.params as Record<
        string,
        unknown
      >;
      expect(params.filtering).toBeDefined();
      const filtering = JSON.parse(params.filtering as string) as Array<
        Record<string, unknown>
      >;
      expect(filtering[0]).toEqual({
        field: 'effective_status',
        operator: 'IN',
        value: ['ACTIVE'],
      });
    });

    it('should use default limit of 50 when not provided', async () => {
      httpService.get.mockReturnValue(
        of({
          config: {} as never,
          data: { data: [] },
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      await service.listCampaigns(mockAccessToken, 'act_123');

      const params = httpService.get.mock.calls[0][1]?.params as Record<
        string,
        unknown
      >;
      expect(params.limit).toBe(50);
    });

    it('should use custom limit when provided', async () => {
      httpService.get.mockReturnValue(
        of({
          config: {} as never,
          data: { data: [] },
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      await service.listCampaigns(mockAccessToken, 'act_123', { limit: 10 });

      const params = httpService.get.mock.calls[0][1]?.params as Record<
        string,
        unknown
      >;
      expect(params.limit).toBe(10);
    });

    it('should throw and log error on API failure', async () => {
      httpService.get.mockReturnValue(
        throwError(() => new Error('Campaign fetch failed')),
      );

      await expect(
        service.listCampaigns(mockAccessToken, 'act_123'),
      ).rejects.toThrow('Campaign fetch failed');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('getCampaignInsights', () => {
    it('should return normalized insights data', async () => {
      const apiResponse = {
        data: [
          {
            clicks: '150',
            cpc: '0.67',
            cpm: '12.50',
            ctr: '2.5',
            date_start: '2024-01-01',
            date_stop: '2024-01-31',
            frequency: '1.8',
            impressions: '6000',
            reach: '3333',
            spend: '100.50',
          },
        ],
      };

      httpService.get.mockReturnValue(
        of({
          config: {} as never,
          data: apiResponse,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      const result: MetaInsightsData[] = await service.getCampaignInsights(
        mockAccessToken,
        '120001',
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          clicks: 150,
          cpc: 0.67,
          cpm: 12.5,
          ctr: 2.5,
          dateStart: '2024-01-01',
          dateStop: '2024-01-31',
          frequency: 1.8,
          impressions: 6000,
          reach: 3333,
          spend: 100.5,
        }),
      );
    });

    it('should use datePreset when provided', async () => {
      httpService.get.mockReturnValue(
        of({
          config: {} as never,
          data: { data: [] },
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      const params: MetaInsightsParams = { datePreset: 'last_30d' };
      await service.getCampaignInsights(mockAccessToken, '120001', params);

      const callParams = httpService.get.mock.calls[0][1]?.params as Record<
        string,
        unknown
      >;
      expect(callParams.date_preset).toBe('last_30d');
    });

    it('should use timeRange when provided', async () => {
      httpService.get.mockReturnValue(
        of({
          config: {} as never,
          data: { data: [] },
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      const params: MetaInsightsParams = {
        timeRange: { since: '2024-01-01', until: '2024-01-31' },
      };
      await service.getCampaignInsights(mockAccessToken, '120001', params);

      const callParams = httpService.get.mock.calls[0][1]?.params as Record<
        string,
        unknown
      >;
      expect(callParams.time_range).toBeDefined();
    });

    it('should use custom fields when provided', async () => {
      httpService.get.mockReturnValue(
        of({
          config: {} as never,
          data: { data: [] },
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      const params: MetaInsightsParams = { fields: ['spend', 'clicks'] };
      await service.getCampaignInsights(mockAccessToken, '120001', params);

      const callParams = httpService.get.mock.calls[0][1]?.params as Record<
        string,
        unknown
      >;
      expect(callParams.fields).toBe('spend,clicks');
    });

    it('should use default fields when none provided', async () => {
      httpService.get.mockReturnValue(
        of({
          config: {} as never,
          data: { data: [] },
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      await service.getCampaignInsights(mockAccessToken, '120001');

      const callParams = httpService.get.mock.calls[0][1]?.params as Record<
        string,
        unknown
      >;
      expect(callParams.fields).toContain('spend');
      expect(callParams.fields).toContain('impressions');
      expect(callParams.fields).toContain('clicks');
    });

    it('should handle zero/missing values gracefully', async () => {
      const apiResponse = {
        data: [
          {
            clicks: undefined,
            cpc: undefined,
            cpm: undefined,
            ctr: undefined,
            impressions: undefined,
            spend: undefined,
          },
        ],
      };

      httpService.get.mockReturnValue(
        of({
          config: {} as never,
          data: apiResponse,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      const result = await service.getCampaignInsights(
        mockAccessToken,
        '120001',
      );

      expect(result[0].spend).toBe(0);
      expect(result[0].impressions).toBe(0);
      expect(result[0].clicks).toBe(0);
      expect(result[0].ctr).toBe(0);
      expect(result[0].cpc).toBe(0);
      expect(result[0].cpm).toBe(0);
    });

    it('should throw and log error on API failure', async () => {
      httpService.get.mockReturnValue(
        throwError(() => new Error('Insights failed')),
      );

      await expect(
        service.getCampaignInsights(mockAccessToken, '120001'),
      ).rejects.toThrow('Insights failed');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('getAdSetInsights', () => {
    it('should call getInsights with adset path', async () => {
      httpService.get.mockReturnValue(
        of({
          config: {} as never,
          data: { data: [] },
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      await service.getAdSetInsights(mockAccessToken, 'adset_123');

      expect(httpService.get).toHaveBeenCalledWith(
        expect.stringContaining('adset_123/insights'),
        expect.any(Object),
      );
    });
  });

  describe('getAdInsights', () => {
    it('should call getInsights with ad path', async () => {
      httpService.get.mockReturnValue(
        of({
          config: {} as never,
          data: { data: [] },
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      await service.getAdInsights(mockAccessToken, 'ad_456');

      expect(httpService.get).toHaveBeenCalledWith(
        expect.stringContaining('ad_456/insights'),
        expect.any(Object),
      );
    });
  });

  describe('getAdCreatives', () => {
    it('should return mapped ad creatives', async () => {
      const apiResponse = {
        data: [
          {
            body: 'Ad body text',
            call_to_action_type: 'SHOP_NOW',
            id: 'creative_1',
            image_url: 'https://example.com/image.jpg',
            link_url: 'https://example.com/landing',
            name: 'Creative Alpha',
            thumbnail_url: 'https://example.com/thumb.jpg',
            title: 'Great Deal',
            video_id: undefined,
          },
        ],
      };

      httpService.get.mockReturnValue(
        of({
          config: {} as never,
          data: apiResponse,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      const result: MetaAdCreative[] = await service.getAdCreatives(
        mockAccessToken,
        'act_123',
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        body: 'Ad body text',
        callToActionType: 'SHOP_NOW',
        id: 'creative_1',
        imageUrl: 'https://example.com/image.jpg',
        linkUrl: 'https://example.com/landing',
        name: 'Creative Alpha',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        title: 'Great Deal',
        videoId: undefined,
      });
    });

    it('should use default limit of 50', async () => {
      httpService.get.mockReturnValue(
        of({
          config: {} as never,
          data: { data: [] },
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      await service.getAdCreatives(mockAccessToken, 'act_123');

      const params = httpService.get.mock.calls[0][1]?.params as Record<
        string,
        unknown
      >;
      expect(params.limit).toBe(50);
    });

    it('should use custom limit when provided', async () => {
      httpService.get.mockReturnValue(
        of({
          config: {} as never,
          data: { data: [] },
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      await service.getAdCreatives(mockAccessToken, 'act_123', { limit: 25 });

      const params = httpService.get.mock.calls[0][1]?.params as Record<
        string,
        unknown
      >;
      expect(params.limit).toBe(25);
    });

    it('should throw and log error on API failure', async () => {
      httpService.get.mockReturnValue(
        throwError(() => new Error('Creatives fetch failed')),
      );

      await expect(
        service.getAdCreatives(mockAccessToken, 'act_123'),
      ).rejects.toThrow('Creatives fetch failed');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('compareCampaigns', () => {
    it('should compare multiple campaigns', async () => {
      // Promise.all makes call order non-deterministic, so use URL-based routing
      httpService.get.mockImplementation((url: string) => {
        if (url.includes('120001/insights')) {
          return of({
            config: {} as never,
            data: {
              data: [
                {
                  clicks: '100',
                  cpc: '0.5',
                  cpm: '10',
                  ctr: '2.0',
                  date_start: '2024-01-01',
                  date_stop: '2024-01-31',
                  impressions: '5000',
                  spend: '50',
                },
              ],
            },
            headers: {},
            status: 200,
            statusText: 'OK',
          });
        }
        if (url.includes('120002/insights')) {
          return of({
            config: {} as never,
            data: {
              data: [
                {
                  clicks: '200',
                  cpc: '0.3',
                  cpm: '8',
                  ctr: '4.0',
                  date_start: '2024-01-01',
                  date_stop: '2024-01-31',
                  impressions: '10000',
                  spend: '60',
                },
              ],
            },
            headers: {},
            status: 200,
            statusText: 'OK',
          });
        }
        if (url.includes('120001')) {
          return of({
            config: {} as never,
            data: { id: '120001', name: 'Campaign A' },
            headers: {},
            status: 200,
            statusText: 'OK',
          });
        }
        if (url.includes('120002')) {
          return of({
            config: {} as never,
            data: { id: '120002', name: 'Campaign B' },
            headers: {},
            status: 200,
            statusText: 'OK',
          });
        }
        return of({
          config: {} as never,
          data: {},
          headers: {},
          status: 200,
          statusText: 'OK',
        });
      });

      const result: MetaCampaignComparison = await service.compareCampaigns(
        mockAccessToken,
        ['120001', '120002'],
      );

      expect(result.campaigns).toHaveLength(2);
      expect(result.campaigns[0].name).toBe('Campaign A');
      expect(result.campaigns[1].name).toBe('Campaign B');
      expect(result.campaigns[0].insights.spend).toBe(50);
      expect(result.campaigns[1].insights.spend).toBe(60);
    });

    it('should return empty insights when no data returned', async () => {
      httpService.get
        .mockReturnValueOnce(
          of({
            config: {} as never,
            data: { data: [] },
            headers: {},
            status: 200,
            statusText: 'OK',
          }),
        )
        .mockReturnValueOnce(
          of({
            config: {} as never,
            data: { id: '120001', name: 'Empty Campaign' },
            headers: {},
            status: 200,
            statusText: 'OK',
          }),
        );

      const result = await service.compareCampaigns(mockAccessToken, [
        '120001',
      ]);

      expect(result.campaigns).toHaveLength(1);
      expect(result.campaigns[0].name).toBe('Empty Campaign');
    });

    it('should throw and log error on API failure', async () => {
      httpService.get.mockReturnValue(
        throwError(() => new Error('Compare failed')),
      );

      await expect(
        service.compareCampaigns(mockAccessToken, ['120001']),
      ).rejects.toThrow('Compare failed');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('getTopPerformers', () => {
    it('should return top performers sorted by metric', async () => {
      const apiResponse = {
        data: [
          {
            id: 'ad_1',
            insights: {
              data: [
                {
                  clicks: '200',
                  cpc: '0.3',
                  cpm: '8',
                  ctr: '4.0',
                  impressions: '5000',
                  spend: '60',
                },
              ],
            },
            name: 'Ad Alpha',
          },
          {
            id: 'ad_2',
            insights: {
              data: [
                {
                  clicks: '50',
                  cpc: '1.0',
                  cpm: '20',
                  ctr: '1.0',
                  impressions: '5000',
                  spend: '50',
                },
              ],
            },
            name: 'Ad Beta',
          },
          {
            id: 'ad_3',
            insights: undefined,
            name: 'Ad Gamma (no insights)',
          },
        ],
      };

      httpService.get.mockReturnValue(
        of({
          config: {} as never,
          data: apiResponse,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      const result: MetaTopPerformer[] = await service.getTopPerformers(
        mockAccessToken,
        'act_123',
        'clicks',
        5,
      );

      // Ad Gamma should be filtered out (no insights)
      expect(result).toHaveLength(2);
      // Sorted by clicks descending
      expect(result[0].id).toBe('ad_1');
      expect(result[0].value).toBe(200);
      expect(result[0].metric).toBe('clicks');
      expect(result[1].id).toBe('ad_2');
      expect(result[1].value).toBe(50);
    });

    it('should use default limit of 10', async () => {
      httpService.get.mockReturnValue(
        of({
          config: {} as never,
          data: { data: [] },
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      await service.getTopPerformers(mockAccessToken, 'act_123', 'spend');

      const params = httpService.get.mock.calls[0][1]?.params as Record<
        string,
        unknown
      >;
      expect(params.limit).toBe(100); // fetches 100 ads, then slices to `limit` param
    });

    it('should filter out ads without insights', async () => {
      const apiResponse = {
        data: [
          { id: 'ad_1', insights: undefined, name: 'No Insights' },
          { id: 'ad_2', insights: { data: [] }, name: 'Empty Insights' },
        ],
      };

      httpService.get.mockReturnValue(
        of({
          config: {} as never,
          data: apiResponse,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      const result = await service.getTopPerformers(
        mockAccessToken,
        'act_123',
        'spend',
      );

      expect(result).toHaveLength(0);
    });

    it('should return 0 for unknown metric', async () => {
      const apiResponse = {
        data: [
          {
            id: 'ad_1',
            insights: {
              data: [{ clicks: '100', impressions: '5000', spend: '50' }],
            },
            name: 'Ad',
          },
        ],
      };

      httpService.get.mockReturnValue(
        of({
          config: {} as never,
          data: apiResponse,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      const result = await service.getTopPerformers(
        mockAccessToken,
        'act_123',
        'nonexistent_metric',
      );

      expect(result[0].value).toBe(0);
    });

    it('should throw and log error on API failure', async () => {
      httpService.get.mockReturnValue(
        throwError(() => new Error('Top performers failed')),
      );

      await expect(
        service.getTopPerformers(mockAccessToken, 'act_123', 'clicks'),
      ).rejects.toThrow('Top performers failed');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });
});
