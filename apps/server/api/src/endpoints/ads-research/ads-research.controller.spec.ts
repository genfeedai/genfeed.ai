import { AdsResearchController } from '@api/endpoints/ads-research/ads-research.controller';
import { AdsResearchService } from '@api/endpoints/ads-research/ads-research.service';
import type { User } from '@clerk/backend';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getPublicMetadata: vi.fn().mockReturnValue({
    organization: '507f1f77bcf86cd799439012',
    user: '507f1f77bcf86cd799439011',
  }),
}));

describe('AdsResearchController', () => {
  let controller: AdsResearchController;
  let service: {
    createRemixWorkflow: ReturnType<typeof vi.fn>;
    generateAdPack: ReturnType<typeof vi.fn>;
    getAdDetail: ReturnType<typeof vi.fn>;
    listAds: ReturnType<typeof vi.fn>;
    prepareCampaignForReview: ReturnType<typeof vi.fn>;
  };

  const mockUser = {
    publicMetadata: {
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
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
      ],
    }).compile();

    controller = module.get(AdsResearchController);
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
      await controller.listAds(mockUser, 'brand-1', 'Nike', 'fashion');

      expect(service.listAds).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439012',
        expect.objectContaining({
          brandId: 'brand-1',
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
        '507f1f77bcf86cd799439012',
        expect.objectContaining({ limit: 25 }),
      );
    });

    it('should pass undefined limit when not provided', async () => {
      await controller.listAds(mockUser);

      expect(service.listAds).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439012',
        expect.objectContaining({ limit: undefined }),
      );
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
        '507f1f77bcf86cd799439012',
        expect.objectContaining({
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
        '507f1f77bcf86cd799439012',
        expect.objectContaining({ adId: 'ad-1', source: 'meta_ads' }),
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
          organizationId: '507f1f77bcf86cd799439012',
          source: 'meta_ads',
          userId: '507f1f77bcf86cd799439011',
        }),
      );
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
          campaignName: 'Spring Campaign',
          dailyBudget: 50,
          organizationId: '507f1f77bcf86cd799439012',
          source: 'meta_ads',
          userId: '507f1f77bcf86cd799439011',
        }),
      );
    });
  });
});
