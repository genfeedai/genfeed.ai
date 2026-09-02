import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { MembersService } from '@api/collections/members/services/members.service';
import { AdsResearchController } from '@api/endpoints/ads-research/ads-research.controller';
import { AdsResearchService } from '@api/endpoints/ads-research/ads-research.service';
import { PaidCreativeProviderRegistry } from '@api/services/paid-creative-research/providers/paid-creative-provider.registry';
import { testId } from '@helpers/testing/test-id.helper';
import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AdsResearchController', () => {
  let controller: AdsResearchController;
  let providerRegistry: { getReadiness: ReturnType<typeof vi.fn> };
  let service: {
    createRemixWorkflow: ReturnType<typeof vi.fn>;
    generateAdPack: ReturnType<typeof vi.fn>;
    getAdDetail: ReturnType<typeof vi.fn>;
    listAds: ReturnType<typeof vi.fn>;
    prepareCampaignForReview: ReturnType<typeof vi.fn>;
  };

  const organizationId = testId('org');
  const userId = testId('user');
  const brandId = testId('brand');
  const foreignBrandId = testId('foreignbrand');

  const mockUser = {
    brandId,
    organizationId,
    userId,
  } as unknown as User;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdsResearchController],
      providers: [
        {
          provide: AdsResearchService,
          useValue: {
            createRemixWorkflow: vi
              .fn()
              .mockResolvedValue({ workflowId: 'wf-1' }),
            generateAdPack: vi
              .fn()
              .mockResolvedValue({ adPack: { headlines: [] } }),
            getAdDetail: vi
              .fn()
              .mockResolvedValue({ id: 'ad-1', title: 'Test Ad' }),
            listAds: vi.fn().mockResolvedValue({ ads: [] }),
            prepareCampaignForReview: vi
              .fn()
              .mockResolvedValue({ campaignId: 'camp-1' }),
          },
        },
        {
          provide: MembersService,
          useValue: { find: vi.fn().mockResolvedValue([]), findOne: vi.fn() },
        },
        {
          provide: PaidCreativeProviderRegistry,
          useValue: {
            getReadiness: vi.fn().mockReturnValue([
              {
                available: true,
                blockers: [],
                documentationUrl: 'https://www.facebook.com/ads/library/',
                platform: 'meta',
                provider: 'meta_ads_library',
                status: 'available',
              },
              {
                available: false,
                blockers: ['google_ads_transparency_contract_fixtures_missing'],
                documentationUrl: 'https://adstransparency.google.com/',
                platform: 'youtube',
                provider: 'google_ads_transparency_center',
                status: 'unavailable',
              },
            ]),
          },
        },
      ],
    }).compile();

    controller = module.get(AdsResearchController);
    providerRegistry = module.get(PaidCreativeProviderRegistry);
    service = module.get(AdsResearchService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('listAds', () => {
    it('should list ads with organization scope', async () => {
      await controller.listAds(mockUser, brandId, 'Nike', 'fashion');

      expect(service.listAds).toHaveBeenCalledWith(
        organizationId,
        expect.objectContaining({
          brandId,
          brandName: 'Nike',
          industry: 'fashion',
        }),
      );
    });

    it('should convert limit string to number', async () => {
      await controller.listAds(
        mockUser,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        '25',
      );

      expect(service.listAds).toHaveBeenCalledWith(
        organizationId,
        expect.objectContaining({ limit: 25 }),
      );
    });

    it('should pass undefined limit when not provided', async () => {
      await controller.listAds(mockUser);

      expect(service.listAds).toHaveBeenCalledWith(
        organizationId,
        expect.objectContaining({ limit: undefined }),
      );
    });

    it('rejects a foreign requested brand before reading ads', async () => {
      await expect(
        controller.listAds(mockUser, foreignBrandId),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(service.listAds).not.toHaveBeenCalled();
    });
  });

  describe('getAdDetail', () => {
    it('should fetch ad detail with organization scope', async () => {
      const result = await controller.getAdDetail(
        mockUser,
        'meta_ads' as never,
        'ad-1',
        'facebook' as never,
        'feed' as never,
      );

      expect(service.getAdDetail).toHaveBeenCalledWith(
        organizationId,
        expect.objectContaining({
          brandId,
          channel: 'feed',
          id: 'ad-1',
          platform: 'facebook',
          source: 'meta_ads',
        }),
      );
      expect(result).toEqual({ id: 'ad-1', title: 'Test Ad' });
    });
  });

  describe('generateAdPack', () => {
    it('should generate ad pack with organization scope', async () => {
      const body = { adId: 'ad-1', source: 'meta_ads' as never };
      const result = await controller.generateAdPack(mockUser, body);

      expect(service.generateAdPack).toHaveBeenCalledWith(
        organizationId,
        expect.objectContaining({ adId: 'ad-1', brandId, source: 'meta_ads' }),
      );
      expect(result).toEqual({ adPack: { headlines: [] } });
    });
  });

  describe('createRemixWorkflow', () => {
    it('should create remix workflow with org and user metadata', async () => {
      const body = { adId: 'ad-1', source: 'meta_ads' as never };
      await controller.createRemixWorkflow(mockUser, body);

      expect(service.createRemixWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({
          adId: 'ad-1',
          brandId,
          organizationId,
          source: 'meta_ads',
          userId,
        }),
      );
    });

    it('rejects a foreign-brand remix before calling the service', async () => {
      await expect(
        controller.createRemixWorkflow(mockUser, {
          adId: 'ad-1',
          brandId: foreignBrandId,
          source: 'public',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(service.createRemixWorkflow).not.toHaveBeenCalled();
    });
  });

  describe('prepareCampaignForReview', () => {
    it('should prepare campaign with org and user metadata', async () => {
      const body = {
        adId: 'ad-1',
        campaignName: 'Spring Campaign',
        dailyBudget: 50,
        source: 'meta_ads' as never,
      };

      await controller.prepareCampaignForReview(mockUser, body);

      expect(service.prepareCampaignForReview).toHaveBeenCalledWith(
        expect.objectContaining({
          adId: 'ad-1',
          brandId,
          campaignName: 'Spring Campaign',
          dailyBudget: 50,
          organizationId,
          source: 'meta_ads',
          userId,
        }),
      );
    });
  });

  describe('listWatchlistReadiness', () => {
    it('reports every watched platform, including the blocked ones (#3537)', () => {
      const result = controller.listWatchlistReadiness();

      expect(providerRegistry.getReadiness).toHaveBeenCalled();
      expect(result).toEqual([
        {
          available: true,
          blockers: [],
          documentationUrl: 'https://www.facebook.com/ads/library/',
          platform: 'meta',
          provider: 'meta_ads_library',
          status: 'available',
        },
        {
          available: false,
          blockers: ['google_ads_transparency_contract_fixtures_missing'],
          documentationUrl: 'https://adstransparency.google.com/',
          platform: 'youtube',
          provider: 'google_ads_transparency_center',
          status: 'unavailable',
        },
      ]);
    });
  });
});
