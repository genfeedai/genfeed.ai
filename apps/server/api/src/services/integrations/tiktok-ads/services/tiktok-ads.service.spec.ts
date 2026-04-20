import { ConfigService } from '@api/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';

import { TikTokAdsService } from './tiktok-ads.service';

const ACCESS_TOKEN = 'test-access-token';
const ADVERTISER_ID = 'adv-123456';

const makeApiResponse = <T>(data: T, code = 0) => ({
  data: {
    code,
    data,
    message: code === 0 ? 'OK' : 'Error',
    request_id: 'req-abc',
  },
});

describe('TikTokAdsService', () => {
  let service: TikTokAdsService;
  let httpService: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
  };
  let logger: vi.Mocked<LoggerService>;

  beforeEach(async () => {
    httpService = { get: vi.fn(), post: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TikTokAdsService,
        {
          provide: ConfigService,
          useValue: { get: vi.fn() },
        },
        {
          provide: HttpService,
          useValue: httpService,
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TikTokAdsService>(TikTokAdsService);
    logger = module.get(LoggerService);

    // Default: no rate-limit wait — patch lastRequestTime to well in the past
    (service as unknown as { lastRequestTime: number }).lastRequestTime = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── getAdAccounts ────────────────────────────────────────────────────────

  describe('getAdAccounts', () => {
    it('should return mapped ad accounts', async () => {
      httpService.get.mockReturnValue(
        of(
          makeApiResponse({
            list: [
              {
                advertiser_id: 'adv-1',
                advertiser_name: 'Acme Corp',
                currency: 'USD',
                role: 'ADMIN',
                status: 'STATUS_ENABLE',
                timezone: 'UTC',
              },
            ],
          }),
        ),
      );

      const accounts = await service.getAdAccounts(ACCESS_TOKEN);
      expect(accounts).toHaveLength(1);
      expect(accounts[0]).toMatchObject({
        advertiserId: 'adv-1',
        advertiserName: 'Acme Corp',
        currency: 'USD',
        role: 'ADMIN',
        status: 'STATUS_ENABLE',
        timezone: 'UTC',
      });
    });

    it('should return empty array when list is null/missing', async () => {
      httpService.get.mockReturnValue(of(makeApiResponse({ list: null })));
      const accounts = await service.getAdAccounts(ACCESS_TOKEN);
      expect(accounts).toEqual([]);
    });

    it('should throw and log error when API returns non-zero code', async () => {
      httpService.get.mockReturnValue(of(makeApiResponse({}, 40001)));
      await expect(service.getAdAccounts(ACCESS_TOKEN)).rejects.toThrow(
        'TikTok API error 40001',
      );
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // ─── listCampaigns ────────────────────────────────────────────────────────

  describe('listCampaigns', () => {
    it('should map campaign fields correctly', async () => {
      httpService.get.mockReturnValue(
        of(
          makeApiResponse({
            list: [
              {
                budget: 50_000_000, // 50 USD in micros
                budget_mode: 'DAILY',
                campaign_id: 'camp-1',
                campaign_name: 'Spring Sale',
                create_time: '2026-01-01',
                modify_time: '2026-01-02',
                objective_type: 'REACH',
                status: 'STATUS_ENABLE',
              },
            ],
          }),
        ),
      );

      const campaigns = await service.listCampaigns(
        ACCESS_TOKEN,
        ADVERTISER_ID,
      );
      expect(campaigns[0]).toMatchObject({
        budget: 50, // divided by MICROS_DIVISOR (1_000_000)
        budgetMode: 'DAILY',
        campaignId: 'camp-1',
        campaignName: 'Spring Sale',
        objective: 'REACH',
        status: 'STATUS_ENABLE',
      });
    });

    it('should pass status filter as JSON in query params', async () => {
      httpService.get.mockReturnValue(of(makeApiResponse({ list: [] })));

      await service.listCampaigns(ACCESS_TOKEN, ADVERTISER_ID, {
        status: 'STATUS_ENABLE',
      });

      const [, config] = httpService.get.mock.calls[0] as [
        string,
        { params: Record<string, unknown> },
      ];
      expect(config.params.filtering).toBeDefined();
    });
  });

  // ─── createCampaign ───────────────────────────────────────────────────────

  describe('createCampaign', () => {
    it('should return campaign_id from API', async () => {
      httpService.post.mockReturnValue(
        of(makeApiResponse({ campaign_id: 'new-camp-99' })),
      );

      const id = await service.createCampaign(ACCESS_TOKEN, ADVERTISER_ID, {
        budget: 100,
        budgetMode: 'LIFETIME',
        campaignName: 'Summer Blast',
        objectiveType: 'VIDEO_VIEWS',
      });

      expect(id).toBe('new-camp-99');
      expect(logger.log).toHaveBeenCalled();
    });

    it('should convert budget to micros before sending', async () => {
      httpService.post.mockReturnValue(
        of(makeApiResponse({ campaign_id: 'camp-x' })),
      );

      await service.createCampaign(ACCESS_TOKEN, ADVERTISER_ID, {
        budget: 25.5,
        budgetMode: 'DAILY',
        campaignName: 'Test',
        objectiveType: 'REACH',
      });

      const [, body] = httpService.post.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(body.budget).toBe(25_500_000);
    });

    it('should propagate errors from http layer', async () => {
      httpService.post.mockReturnValue(of(makeApiResponse({}, 40100)));
      await expect(
        service.createCampaign(ACCESS_TOKEN, ADVERTISER_ID, {
          budgetMode: 'DAILY',
          campaignName: 'Fail',
          objectiveType: 'REACH',
        }),
      ).rejects.toThrow('TikTok API error');
    });
  });

  // ─── pauseCampaign ────────────────────────────────────────────────────────

  describe('pauseCampaign', () => {
    it('should post DISABLE status update', async () => {
      httpService.post.mockReturnValue(of(makeApiResponse({})));

      await service.pauseCampaign(ACCESS_TOKEN, ADVERTISER_ID, 'camp-1');

      const [url, body] = httpService.post.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(url).toContain('campaign/status/update');
      expect(body).toMatchObject({
        campaign_ids: ['camp-1'],
        opt_status: 'DISABLE',
      });
    });
  });

  // ─── uploadImage ──────────────────────────────────────────────────────────

  describe('uploadImage', () => {
    it('should return imageId and imageUrl', async () => {
      httpService.post.mockReturnValue(
        of(
          makeApiResponse({
            id: 'img-99',
            image_url: 'https://cdn.example.com/img.jpg',
          }),
        ),
      );

      const result = await service.uploadImage(
        ACCESS_TOKEN,
        ADVERTISER_ID,
        'https://source.example.com/img.jpg',
      );

      expect(result).toEqual({
        imageId: 'img-99',
        imageUrl: 'https://cdn.example.com/img.jpg',
      });
    });
  });

  // ─── uploadVideo ──────────────────────────────────────────────────────────

  describe('uploadVideo', () => {
    it('should return videoId', async () => {
      httpService.post.mockReturnValue(
        of(makeApiResponse({ video_id: 'vid-55' })),
      );

      const result = await service.uploadVideo(
        ACCESS_TOKEN,
        ADVERTISER_ID,
        'https://source.example.com/vid.mp4',
      );

      expect(result).toEqual({ videoId: 'vid-55' });
    });
  });

  // ─── getCampaignInsights ──────────────────────────────────────────────────

  describe('getCampaignInsights', () => {
    it('should normalise report row metrics to numbers', async () => {
      httpService.post.mockReturnValue(
        of(
          makeApiResponse({
            list: [
              {
                dimensions: { stat_time_day: '2026-01-01' },
                metrics: {
                  clicks: '50',
                  conversion: '5',
                  conversion_rate: '0.1',
                  cost_per_conversion: '2.1',
                  cpc: '0.21',
                  cpm: '10.5',
                  ctr: '0.05',
                  frequency: '1.1',
                  impressions: '1000',
                  reach: '900',
                  spend: '10.5',
                },
              },
            ],
          }),
        ),
      );

      const insights = await service.getCampaignInsights(
        ACCESS_TOKEN,
        ADVERTISER_ID,
        'camp-1',
        { endDate: '2026-01-31', startDate: '2026-01-01' },
      );

      expect(insights).toHaveLength(1);
      expect(insights[0]).toMatchObject({
        clicks: 50,
        ctr: 0.05,
        impressions: 1000,
        spend: 10.5,
        statTimeDay: '2026-01-01',
      });
    });
  });
});
