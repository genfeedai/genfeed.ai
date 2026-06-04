import { ConfigService } from '@api/config/config.service';
import type {
  CreateAdParams,
  CreateAdSetParams,
  CreateCampaignParams,
  MetaImageUploadResponse,
  MetaVideoUploadResponse,
} from '@api/services/integrations/meta-ads/interfaces/meta-ads.interface';
import { MetaAdsService } from '@api/services/integrations/meta-ads/services/meta-ads.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';

describe('MetaAdsService - Write Operations', () => {
  let service: MetaAdsService;
  let httpService: vi.Mocked<HttpService>;
  let loggerService: vi.Mocked<LoggerService>;

  const mockAccessToken = 'EAABsbCS1iHgBO0ZCtest';
  const mockAdAccountId = 'act_123456789';

  const mockAxiosResponse = <T>(data: T) =>
    of({
      config: {} as never,
      data,
      headers: {},
      status: 200,
      statusText: 'OK',
    });

  beforeEach(async () => {
    const mockConfigService = {
      get: vi.fn(),
    };

    const mockHttpService = {
      delete: vi.fn(),
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

  // ─── createCampaign ──────────────────────────────────────────────────────

  describe('createCampaign', () => {
    const defaultParams: CreateCampaignParams = {
      name: 'Summer Sale 2024',
      objective: 'LINK_CLICKS',
    };

    it('should create a campaign and return its ID', async () => {
      httpService.post.mockReturnValue(mockAxiosResponse({ id: '120001' }));

      const result = await service.createCampaign(
        mockAccessToken,
        mockAdAccountId,
        defaultParams,
      );

      expect(result).toBe('120001');
      expect(httpService.post).toHaveBeenCalledWith(
        expect.stringContaining(`${mockAdAccountId}/campaigns`),
        null,
        expect.objectContaining({
          params: expect.objectContaining({
            access_token: mockAccessToken,
            name: 'Summer Sale 2024',
            objective: 'LINK_CLICKS',
            status: 'PAUSED',
          }),
        }),
      );
    });

    it('should convert daily budget from dollars to cents', async () => {
      httpService.post.mockReturnValue(mockAxiosResponse({ id: '120002' }));

      await service.createCampaign(mockAccessToken, mockAdAccountId, {
        ...defaultParams,
        dailyBudget: 50,
      });

      const params = httpService.post.mock.calls[0][2]?.params as Record<
        string,
        unknown
      >;
      expect(params.daily_budget).toBe(5000);
    });

    it('should convert lifetime budget from dollars to cents', async () => {
      httpService.post.mockReturnValue(mockAxiosResponse({ id: '120003' }));

      await service.createCampaign(mockAccessToken, mockAdAccountId, {
        ...defaultParams,
        lifetimeBudget: 1000,
      });

      const params = httpService.post.mock.calls[0][2]?.params as Record<
        string,
        unknown
      >;
      expect(params.lifetime_budget).toBe(100000);
    });

    it('should pass special ad categories as JSON string', async () => {
      httpService.post.mockReturnValue(mockAxiosResponse({ id: '120004' }));

      await service.createCampaign(mockAccessToken, mockAdAccountId, {
        ...defaultParams,
        specialAdCategories: ['HOUSING', 'CREDIT'],
      });

      const params = httpService.post.mock.calls[0][2]?.params as Record<
        string,
        unknown
      >;
      expect(params.special_ad_categories).toBe(
        JSON.stringify(['HOUSING', 'CREDIT']),
      );
    });

    it('should use custom status when provided', async () => {
      httpService.post.mockReturnValue(mockAxiosResponse({ id: '120005' }));

      await service.createCampaign(mockAccessToken, mockAdAccountId, {
        ...defaultParams,
        status: 'ACTIVE',
      });

      const params = httpService.post.mock.calls[0][2]?.params as Record<
        string,
        unknown
      >;
      expect(params.status).toBe('ACTIVE');
    });

    it('should default to empty special ad categories', async () => {
      httpService.post.mockReturnValue(mockAxiosResponse({ id: '120006' }));

      await service.createCampaign(
        mockAccessToken,
        mockAdAccountId,
        defaultParams,
      );

      const params = httpService.post.mock.calls[0][2]?.params as Record<
        string,
        unknown
      >;
      expect(params.special_ad_categories).toBe('[]');
    });

    it('should throw and log error on API failure', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('Campaign creation failed')),
      );

      await expect(
        service.createCampaign(mockAccessToken, mockAdAccountId, defaultParams),
      ).rejects.toThrow('Campaign creation failed');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  // ─── updateCampaign ──────────────────────────────────────────────────────

  describe('updateCampaign', () => {
    it('should update campaign name', async () => {
      httpService.post.mockReturnValue(mockAxiosResponse({ success: true }));

      await service.updateCampaign(mockAccessToken, '120001', {
        name: 'New Name',
      });

      const params = httpService.post.mock.calls[0][2]?.params as Record<
        string,
        unknown
      >;
      expect(params.name).toBe('New Name');
    });

    it('should update campaign status', async () => {
      httpService.post.mockReturnValue(mockAxiosResponse({ success: true }));

      await service.updateCampaign(mockAccessToken, '120001', {
        status: 'ACTIVE',
      });

      const params = httpService.post.mock.calls[0][2]?.params as Record<
        string,
        unknown
      >;
      expect(params.status).toBe('ACTIVE');
    });

    it('should convert budget to cents on update', async () => {
      httpService.post.mockReturnValue(mockAxiosResponse({ success: true }));

      await service.updateCampaign(mockAccessToken, '120001', {
        dailyBudget: 25,
        lifetimeBudget: 500,
      });

      const params = httpService.post.mock.calls[0][2]?.params as Record<
        string,
        unknown
      >;
      expect(params.daily_budget).toBe(2500);
      expect(params.lifetime_budget).toBe(50000);
    });

    it('should only send provided fields', async () => {
      httpService.post.mockReturnValue(mockAxiosResponse({ success: true }));

      await service.updateCampaign(mockAccessToken, '120001', {
        name: 'Only Name',
      });

      const params = httpService.post.mock.calls[0][2]?.params as Record<
        string,
        unknown
      >;
      expect(params.name).toBe('Only Name');
      expect(params.status).toBeUndefined();
      expect(params.daily_budget).toBeUndefined();
    });

    it('should throw and log error on API failure', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('Update failed')),
      );

      await expect(
        service.updateCampaign(mockAccessToken, '120001', {
          name: 'Fail',
        }),
      ).rejects.toThrow('Update failed');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  // ─── pauseCampaign ───────────────────────────────────────────────────────

  describe('pauseCampaign', () => {
    it('should set campaign status to PAUSED', async () => {
      httpService.post.mockReturnValue(mockAxiosResponse({ success: true }));

      await service.pauseCampaign(mockAccessToken, '120001');

      const params = httpService.post.mock.calls[0][2]?.params as Record<
        string,
        unknown
      >;
      expect(params.status).toBe('PAUSED');
    });

    it('should call the correct campaign endpoint', async () => {
      httpService.post.mockReturnValue(mockAxiosResponse({ success: true }));

      await service.pauseCampaign(mockAccessToken, '120001');

      expect(httpService.post).toHaveBeenCalledWith(
        expect.stringContaining('v24.0/120001'),
        null,
        expect.any(Object),
      );
    });

    it('should throw and log error on API failure', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('Pause failed')),
      );

      await expect(
        service.pauseCampaign(mockAccessToken, '120001'),
      ).rejects.toThrow('Pause failed');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  // ─── updateCampaignBudget ────────────────────────────────────────────────

  describe('updateCampaignBudget', () => {
    it('should update daily budget in cents', async () => {
      httpService.post.mockReturnValue(mockAxiosResponse({ success: true }));

      await service.updateCampaignBudget(
        mockAccessToken,
        '120001',
        10,
        undefined,
      );

      const params = httpService.post.mock.calls[0][2]?.params as Record<
        string,
        unknown
      >;
      expect(params.daily_budget).toBe(1000);
      expect(params.lifetime_budget).toBeUndefined();
    });

    it('should update lifetime budget in cents', async () => {
      httpService.post.mockReturnValue(mockAxiosResponse({ success: true }));

      await service.updateCampaignBudget(
        mockAccessToken,
        '120001',
        undefined,
        2000,
      );

      const params = httpService.post.mock.calls[0][2]?.params as Record<
        string,
        unknown
      >;
      expect(params.lifetime_budget).toBe(200000);
      expect(params.daily_budget).toBeUndefined();
    });

    it('should update both budgets when both provided', async () => {
      httpService.post.mockReturnValue(mockAxiosResponse({ success: true }));

      await service.updateCampaignBudget(mockAccessToken, '120001', 15, 3000);

      const params = httpService.post.mock.calls[0][2]?.params as Record<
        string,
        unknown
      >;
      expect(params.daily_budget).toBe(1500);
      expect(params.lifetime_budget).toBe(300000);
    });

    it('should throw and log error on API failure', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('Budget update failed')),
      );

      await expect(
        service.updateCampaignBudget(mockAccessToken, '120001', 10),
      ).rejects.toThrow('Budget update failed');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  // ─── createAdSet ─────────────────────────────────────────────────────────

  describe('createAdSet', () => {
    const defaultAdSetParams: CreateAdSetParams = {
      billingEvent: 'IMPRESSIONS',
      campaignId: '120001',
      name: 'US Audience 25-45',
      optimizationGoal: 'LINK_CLICKS',
      targeting: {
        ageMax: 45,
        ageMin: 25,
        genders: [1, 2],
        geoLocations: { countries: ['US'] },
      },
    };

    it('should create an adset and return its ID', async () => {
      httpService.post.mockReturnValue(mockAxiosResponse({ id: 'adset_001' }));

      const result = await service.createAdSet(
        mockAccessToken,
        mockAdAccountId,
        defaultAdSetParams,
      );

      expect(result).toBe('adset_001');
      expect(httpService.post).toHaveBeenCalledWith(
        expect.stringContaining(`${mockAdAccountId}/adsets`),
        null,
        expect.objectContaining({
          params: expect.objectContaining({
            access_token: mockAccessToken,
            billing_event: 'IMPRESSIONS',
            campaign_id: '120001',
            name: 'US Audience 25-45',
            optimization_goal: 'LINK_CLICKS',
            status: 'PAUSED',
          }),
        }),
      );
    });

    it('should serialize targeting spec as JSON', async () => {
      httpService.post.mockReturnValue(mockAxiosResponse({ id: 'adset_002' }));

      await service.createAdSet(
        mockAccessToken,
        mockAdAccountId,
        defaultAdSetParams,
      );

      const params = httpService.post.mock.calls[0][2]?.params as Record<
        string,
        unknown
      >;
      const targeting = JSON.parse(params.targeting as string);
      expect(targeting.geo_locations).toEqual({ countries: ['US'] });
      expect(targeting.age_min).toBe(25);
      expect(targeting.age_max).toBe(45);
      expect(targeting.genders).toEqual([1, 2]);
    });

    it('should convert adset daily budget to cents', async () => {
      httpService.post.mockReturnValue(mockAxiosResponse({ id: 'adset_003' }));

      await service.createAdSet(mockAccessToken, mockAdAccountId, {
        ...defaultAdSetParams,
        dailyBudget: 20,
      });

      const params = httpService.post.mock.calls[0][2]?.params as Record<
        string,
        unknown
      >;
      expect(params.daily_budget).toBe(2000);
    });

    it('should include start and end time when provided', async () => {
      httpService.post.mockReturnValue(mockAxiosResponse({ id: 'adset_004' }));

      await service.createAdSet(mockAccessToken, mockAdAccountId, {
        ...defaultAdSetParams,
        endTime: '2024-08-31T23:59:59+0000',
        startTime: '2024-06-01T00:00:00+0000',
      });

      const params = httpService.post.mock.calls[0][2]?.params as Record<
        string,
        unknown
      >;
      expect(params.start_time).toBe('2024-06-01T00:00:00+0000');
      expect(params.end_time).toBe('2024-08-31T23:59:59+0000');
    });

    it('should handle targeting with interests and custom audiences', async () => {
      httpService.post.mockReturnValue(mockAxiosResponse({ id: 'adset_005' }));

      await service.createAdSet(mockAccessToken, mockAdAccountId, {
        ...defaultAdSetParams,
        targeting: {
          customAudiences: [{ id: 'ca_12345' }],
          interests: [{ id: '6003139266461', name: 'Fitness' }],
        },
      });

      const params = httpService.post.mock.calls[0][2]?.params as Record<
        string,
        unknown
      >;
      const targeting = JSON.parse(params.targeting as string);
      expect(targeting.interests).toEqual([
        { id: '6003139266461', name: 'Fitness' },
      ]);
      expect(targeting.custom_audiences).toEqual([{ id: 'ca_12345' }]);
    });

    it('should throw and log error on API failure', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('AdSet creation failed')),
      );

      await expect(
        service.createAdSet(
          mockAccessToken,
          mockAdAccountId,
          defaultAdSetParams,
        ),
      ).rejects.toThrow('AdSet creation failed');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  // ─── updateAdSet ─────────────────────────────────────────────────────────

  describe('updateAdSet', () => {
    it('should update adset name', async () => {
      httpService.post.mockReturnValue(mockAxiosResponse({ success: true }));

      await service.updateAdSet(mockAccessToken, 'adset_001', {
        name: 'Updated Audience',
      });

      const params = httpService.post.mock.calls[0][2]?.params as Record<
        string,
        unknown
      >;
      expect(params.name).toBe('Updated Audience');
    });

    it('should update adset targeting', async () => {
      httpService.post.mockReturnValue(mockAxiosResponse({ success: true }));

      const newTargeting = {
        ageMax: 35,
        ageMin: 18,
        geoLocations: { countries: ['UK'] },
      };

      await service.updateAdSet(mockAccessToken, 'adset_001', {
        targeting: newTargeting,
      });

      const params = httpService.post.mock.calls[0][2]?.params as Record<
        string,
        unknown
      >;
      const targeting = JSON.parse(params.targeting as string);
      expect(targeting.geo_locations).toEqual({ countries: ['UK'] });
    });

    it('should convert adset daily budget on update', async () => {
      httpService.post.mockReturnValue(mockAxiosResponse({ success: true }));

      await service.updateAdSet(mockAccessToken, 'adset_001', {
        dailyBudget: 30,
      });

      const params = httpService.post.mock.calls[0][2]?.params as Record<
        string,
        unknown
      >;
      expect(params.daily_budget).toBe(3000);
    });

    it('should throw and log error on API failure', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('AdSet update failed')),
      );

      await expect(
        service.updateAdSet(mockAccessToken, 'adset_001', {
          name: 'Fail',
        }),
      ).rejects.toThrow('AdSet update failed');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  // ─── createAd ────────────────────────────────────────────────────────────

  describe('createAd', () => {
    const defaultAdParams: CreateAdParams = {
      adSetId: 'adset_001',
      creative: {
        body: 'Best deals this summer!',
        callToAction: 'SHOP_NOW',
        imageHash: 'abc123hash',
        linkUrl: 'https://example.com/landing',
        title: 'Shop Now',
      },
      name: 'Summer Ad',
    };

    it('should create an ad and return its ID', async () => {
      httpService.post.mockReturnValue(mockAxiosResponse({ id: 'ad_001' }));

      const result = await service.createAd(
        mockAccessToken,
        mockAdAccountId,
        defaultAdParams,
      );

      expect(result).toBe('ad_001');
      expect(httpService.post).toHaveBeenCalledWith(
        expect.stringContaining(`${mockAdAccountId}/ads`),
        null,
        expect.objectContaining({
          params: expect.objectContaining({
            access_token: mockAccessToken,
            adset_id: 'adset_001',
            name: 'Summer Ad',
            status: 'PAUSED',
          }),
        }),
      );
    });

    it('should serialize creative spec as JSON string', async () => {
      httpService.post.mockReturnValue(mockAxiosResponse({ id: 'ad_002' }));

      await service.createAd(mockAccessToken, mockAdAccountId, defaultAdParams);

      const params = httpService.post.mock.calls[0][2]?.params as Record<
        string,
        unknown
      >;
      const creative = JSON.parse(params.creative as string);
      expect(creative.link_data.name).toBe('Shop Now');
      expect(creative.link_data.message).toBe('Best deals this summer!');
      expect(creative.link_data.image_hash).toBe('abc123hash');
      expect(creative.link_data.link).toBe('https://example.com/landing');
    });

    it('should include call to action in creative', async () => {
      httpService.post.mockReturnValue(mockAxiosResponse({ id: 'ad_003' }));

      await service.createAd(mockAccessToken, mockAdAccountId, defaultAdParams);

      const params = httpService.post.mock.calls[0][2]?.params as Record<
        string,
        unknown
      >;
      const creative = JSON.parse(params.creative as string);
      expect(creative.link_data.call_to_action.type).toBe('SHOP_NOW');
    });

    it('should include video_data when videoId is provided', async () => {
      httpService.post.mockReturnValue(mockAxiosResponse({ id: 'ad_004' }));

      await service.createAd(mockAccessToken, mockAdAccountId, {
        adSetId: 'adset_001',
        creative: {
          body: 'Amazing video',
          callToAction: 'WATCH_MORE',
          linkUrl: 'https://example.com/video',
          title: 'Watch This',
          videoId: 'vid_123',
        },
        name: 'Video Ad',
      });

      const params = httpService.post.mock.calls[0][2]?.params as Record<
        string,
        unknown
      >;
      const creative = JSON.parse(params.creative as string);
      expect(creative.video_data.video_id).toBe('vid_123');
      expect(creative.video_data.title).toBe('Watch This');
    });

    it('should handle minimal creative (linkUrl only)', async () => {
      httpService.post.mockReturnValue(mockAxiosResponse({ id: 'ad_005' }));

      await service.createAd(mockAccessToken, mockAdAccountId, {
        adSetId: 'adset_001',
        creative: {
          linkUrl: 'https://example.com',
        },
        name: 'Minimal Ad',
      });

      const params = httpService.post.mock.calls[0][2]?.params as Record<
        string,
        unknown
      >;
      const creative = JSON.parse(params.creative as string);
      expect(creative.link_data.link).toBe('https://example.com');
      expect(creative.link_data.name).toBeUndefined();
      expect(creative.link_data.message).toBeUndefined();
    });

    it('should throw and log error on API failure', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('Ad creation failed')),
      );

      await expect(
        service.createAd(mockAccessToken, mockAdAccountId, defaultAdParams),
      ).rejects.toThrow('Ad creation failed');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  // ─── pauseAd ─────────────────────────────────────────────────────────────

  describe('pauseAd', () => {
    it('should set ad status to PAUSED', async () => {
      httpService.post.mockReturnValue(mockAxiosResponse({ success: true }));

      await service.pauseAd(mockAccessToken, 'ad_001');

      const params = httpService.post.mock.calls[0][2]?.params as Record<
        string,
        unknown
      >;
      expect(params.status).toBe('PAUSED');
    });

    it('should throw and log error on API failure', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('Pause ad failed')),
      );

      await expect(service.pauseAd(mockAccessToken, 'ad_001')).rejects.toThrow(
        'Pause ad failed',
      );
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  // ─── deleteAd ────────────────────────────────────────────────────────────

  describe('deleteAd', () => {
    it('should call delete endpoint for ad', async () => {
      httpService.delete.mockReturnValue(mockAxiosResponse({ success: true }));

      await service.deleteAd(mockAccessToken, 'ad_001');

      expect(httpService.delete).toHaveBeenCalledWith(
        expect.stringContaining('v24.0/ad_001'),
        expect.objectContaining({
          params: expect.objectContaining({
            access_token: mockAccessToken,
          }),
        }),
      );
    });

    it('should log success on delete', async () => {
      httpService.delete.mockReturnValue(mockAxiosResponse({ success: true }));

      await service.deleteAd(mockAccessToken, 'ad_001');

      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('deleted ad ad_001'),
      );
    });

    it('should throw and log error on API failure', async () => {
      httpService.delete.mockReturnValue(
        throwError(() => new Error('Delete ad failed')),
      );

      await expect(service.deleteAd(mockAccessToken, 'ad_001')).rejects.toThrow(
        'Delete ad failed',
      );
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  // ─── uploadAdImage ───────────────────────────────────────────────────────

  describe('uploadAdImage', () => {
    it('should upload an image and return hash and url', async () => {
      httpService.post.mockReturnValue(
        mockAxiosResponse({
          images: {
            image_file: {
              hash: 'abc123hash',
              url: 'https://fbcdn.net/abc123.jpg',
            },
          },
        }),
      );

      const result: MetaImageUploadResponse = await service.uploadAdImage(
        mockAccessToken,
        mockAdAccountId,
        'https://example.com/product.jpg',
      );

      expect(result.hash).toBe('abc123hash');
      expect(result.url).toBe('https://fbcdn.net/abc123.jpg');
    });

    it('should pass image URL to the API', async () => {
      httpService.post.mockReturnValue(
        mockAxiosResponse({
          images: {
            f: { hash: 'h', url: 'u' },
          },
        }),
      );

      await service.uploadAdImage(
        mockAccessToken,
        mockAdAccountId,
        'https://example.com/photo.png',
      );

      expect(httpService.post).toHaveBeenCalledWith(
        expect.stringContaining(`${mockAdAccountId}/adimages`),
        null,
        expect.objectContaining({
          params: expect.objectContaining({
            url: 'https://example.com/photo.png',
          }),
        }),
      );
    });

    it('should throw and log error on API failure', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('Image upload failed')),
      );

      await expect(
        service.uploadAdImage(
          mockAccessToken,
          mockAdAccountId,
          'https://example.com/bad.jpg',
        ),
      ).rejects.toThrow('Image upload failed');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  // ─── uploadAdVideo ───────────────────────────────────────────────────────

  describe('uploadAdVideo', () => {
    it('should upload a video and return video ID', async () => {
      httpService.post.mockReturnValue(mockAxiosResponse({ id: 'vid_001' }));

      const result: MetaVideoUploadResponse = await service.uploadAdVideo(
        mockAccessToken,
        mockAdAccountId,
        'https://example.com/promo.mp4',
      );

      expect(result.videoId).toBe('vid_001');
    });

    it('should include title when provided', async () => {
      httpService.post.mockReturnValue(mockAxiosResponse({ id: 'vid_002' }));

      await service.uploadAdVideo(
        mockAccessToken,
        mockAdAccountId,
        'https://example.com/promo.mp4',
        'Summer Promo Video',
      );

      const params = httpService.post.mock.calls[0][2]?.params as Record<
        string,
        unknown
      >;
      expect(params.title).toBe('Summer Promo Video');
      expect(params.file_url).toBe('https://example.com/promo.mp4');
    });

    it('should not include title when not provided', async () => {
      httpService.post.mockReturnValue(mockAxiosResponse({ id: 'vid_003' }));

      await service.uploadAdVideo(
        mockAccessToken,
        mockAdAccountId,
        'https://example.com/promo.mp4',
      );

      const params = httpService.post.mock.calls[0][2]?.params as Record<
        string,
        unknown
      >;
      expect(params.title).toBeUndefined();
    });

    it('should call the correct advideos endpoint', async () => {
      httpService.post.mockReturnValue(mockAxiosResponse({ id: 'vid_004' }));

      await service.uploadAdVideo(
        mockAccessToken,
        mockAdAccountId,
        'https://example.com/vid.mp4',
      );

      expect(httpService.post).toHaveBeenCalledWith(
        expect.stringContaining(`${mockAdAccountId}/advideos`),
        null,
        expect.any(Object),
      );
    });

    it('should throw and log error on API failure', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('Video upload failed')),
      );

      await expect(
        service.uploadAdVideo(
          mockAccessToken,
          mockAdAccountId,
          'https://example.com/bad.mp4',
        ),
      ).rejects.toThrow('Video upload failed');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });
});
