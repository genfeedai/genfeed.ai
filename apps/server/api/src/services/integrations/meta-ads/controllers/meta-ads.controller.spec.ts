vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getPublicMetadata: vi.fn(() => ({
    organization: '507f1f77bcf86cd799439011',
    user: '507f1f77bcf86cd799439013',
  })),
}));

vi.mock('@api/shared/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: vi.fn((val: string) => `decrypted:${val}`) },
}));

import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { MetaAdsController } from '@api/services/integrations/meta-ads/controllers/meta-ads.controller';
import { MetaAdsService } from '@api/services/integrations/meta-ads/services/meta-ads.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import type { User } from '@clerk/backend';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

describe('MetaAdsController', () => {
  let controller: MetaAdsController;
  let credentialsService: { findOne: ReturnType<typeof vi.fn> };
  let metaAdsService: {
    compareCampaigns: ReturnType<typeof vi.fn>;
    createAd: ReturnType<typeof vi.fn>;
    createAdSet: ReturnType<typeof vi.fn>;
    createCampaign: ReturnType<typeof vi.fn>;
    deleteAd: ReturnType<typeof vi.fn>;
    getAdAccounts: ReturnType<typeof vi.fn>;
    getAdCreatives: ReturnType<typeof vi.fn>;
    getAdInsights: ReturnType<typeof vi.fn>;
    getAdSetInsights: ReturnType<typeof vi.fn>;
    getCampaignInsights: ReturnType<typeof vi.fn>;
    getTopPerformers: ReturnType<typeof vi.fn>;
    listCampaigns: ReturnType<typeof vi.fn>;
    pauseAd: ReturnType<typeof vi.fn>;
    pauseCampaign: ReturnType<typeof vi.fn>;
    updateAdSet: ReturnType<typeof vi.fn>;
    updateCampaign: ReturnType<typeof vi.fn>;
    updateCampaignBudget: ReturnType<typeof vi.fn>;
    uploadAdImage: ReturnType<typeof vi.fn>;
    uploadAdVideo: ReturnType<typeof vi.fn>;
  };
  let loggerService: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
  };

  const mockUser = {
    publicMetadata: {
      organization: '507f1f77bcf86cd799439011',
      user: '507f1f77bcf86cd799439013',
    },
  } as unknown as User;

  const mockCredential = {
    _id: 'test-object-id',
    accessToken: 'encrypted_fb_token',
    platform: CredentialPlatform.FACEBOOK,
  };

  const decryptedToken = 'decrypted:encrypted_fb_token';

  beforeEach(async () => {
    vi.clearAllMocks();

    credentialsService = { findOne: vi.fn().mockResolvedValue(mockCredential) };

    metaAdsService = {
      compareCampaigns: vi.fn(),
      createAd: vi.fn(),
      createAdSet: vi.fn(),
      createCampaign: vi.fn(),
      deleteAd: vi.fn(),
      getAdAccounts: vi.fn(),
      getAdCreatives: vi.fn(),
      getAdInsights: vi.fn(),
      getAdSetInsights: vi.fn(),
      getCampaignInsights: vi.fn(),
      getTopPerformers: vi.fn(),
      listCampaigns: vi.fn(),
      pauseAd: vi.fn(),
      pauseCampaign: vi.fn(),
      updateAdSet: vi.fn(),
      updateCampaign: vi.fn(),
      updateCampaignBudget: vi.fn(),
      uploadAdImage: vi.fn(),
      uploadAdVideo: vi.fn(),
    };

    loggerService = { error: vi.fn(), log: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetaAdsController,
        { provide: BrandsService, useValue: {} },
        { provide: CredentialsService, useValue: credentialsService },
        { provide: LoggerService, useValue: loggerService },
        { provide: MetaAdsService, useValue: metaAdsService },
      ],
    }).compile();

    controller = module.get(MetaAdsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getAdAccounts', () => {
    it('returns ad accounts using decrypted token', async () => {
      const accounts = [{ id: 'act_123', name: 'Test Account' }];
      metaAdsService.getAdAccounts.mockResolvedValue(accounts);

      const result = await controller.getAdAccounts(mockUser);

      expect(EncryptionUtil.decrypt).toHaveBeenCalledWith('encrypted_fb_token');
      expect(metaAdsService.getAdAccounts).toHaveBeenCalledWith(decryptedToken);
      expect(result).toEqual(accounts);
    });

    it('throws NotFoundException when Facebook credential is missing', async () => {
      credentialsService.findOne.mockResolvedValue(null);

      await expect(controller.getAdAccounts(mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when accessToken is missing', async () => {
      credentialsService.findOne.mockResolvedValue({
        ...mockCredential,
        accessToken: null,
      });

      await expect(controller.getAdAccounts(mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listCampaigns', () => {
    it('lists campaigns with optional filters', async () => {
      const campaigns = [{ id: 'camp_1', name: 'Summer Sale' }];
      metaAdsService.listCampaigns.mockResolvedValue(campaigns);

      const result = await controller.listCampaigns(
        mockUser,
        'act_123',
        'ACTIVE',
        '10',
      );

      expect(metaAdsService.listCampaigns).toHaveBeenCalledWith(
        decryptedToken,
        'act_123',
        { limit: 10, status: 'ACTIVE' },
      );
      expect(result).toEqual(campaigns);
    });

    it('passes undefined limit when not provided', async () => {
      metaAdsService.listCampaigns.mockResolvedValue([]);

      await controller.listCampaigns(mockUser, 'act_123');

      expect(metaAdsService.listCampaigns).toHaveBeenCalledWith(
        decryptedToken,
        'act_123',
        { limit: undefined, status: undefined },
      );
    });
  });

  describe('compareCampaigns', () => {
    it('splits comma-separated campaign IDs and fetches comparison', async () => {
      const comparison = { campaigns: [] };
      metaAdsService.compareCampaigns.mockResolvedValue(comparison);

      const result = await controller.compareCampaigns(
        mockUser,
        'camp_1,camp_2,camp_3',
        'last_30d',
      );

      expect(metaAdsService.compareCampaigns).toHaveBeenCalledWith(
        decryptedToken,
        ['camp_1', 'camp_2', 'camp_3'],
        { datePreset: 'last_30d' },
      );
      expect(result).toEqual(comparison);
    });
  });

  describe('createCampaign', () => {
    it('creates campaign and returns its id', async () => {
      metaAdsService.createCampaign.mockResolvedValue('camp_new_1');

      const result = await controller.createCampaign(mockUser, {
        adAccountId: 'act_123',
        name: 'New Campaign',
        objective: 'LINK_CLICKS',
        status: 'PAUSED',
      } as never);

      expect(metaAdsService.createCampaign).toHaveBeenCalledWith(
        decryptedToken,
        'act_123',
        expect.not.objectContaining({ adAccountId: 'act_123' }),
      );
      expect(result).toEqual({ id: 'camp_new_1' });
    });
  });

  describe('updateCampaign', () => {
    it('updates campaign and returns success', async () => {
      metaAdsService.updateCampaign.mockResolvedValue(undefined);

      const result = await controller.updateCampaign(mockUser, 'camp_1', {
        name: 'Updated',
      } as never);

      expect(metaAdsService.updateCampaign).toHaveBeenCalledWith(
        decryptedToken,
        'camp_1',
        { name: 'Updated' },
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe('pauseCampaign', () => {
    it('pauses campaign and returns success', async () => {
      metaAdsService.pauseCampaign.mockResolvedValue(undefined);

      const result = await controller.pauseCampaign(mockUser, 'camp_pause_1');

      expect(metaAdsService.pauseCampaign).toHaveBeenCalledWith(
        decryptedToken,
        'camp_pause_1',
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe('deleteAd', () => {
    it('deletes ad and returns success', async () => {
      metaAdsService.deleteAd.mockResolvedValue(undefined);

      const result = await controller.deleteAd(mockUser, 'ad_del_1');

      expect(metaAdsService.deleteAd).toHaveBeenCalledWith(
        decryptedToken,
        'ad_del_1',
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe('getCampaignInsights', () => {
    it('builds timeRange param when since/until are provided', async () => {
      const insights = { clicks: 50, impressions: 1000 };
      metaAdsService.getCampaignInsights.mockResolvedValue(insights);

      const result = await controller.getCampaignInsights(
        mockUser,
        'camp_1',
        undefined,
        '2026-01-01',
        '2026-01-31',
      );

      expect(metaAdsService.getCampaignInsights).toHaveBeenCalledWith(
        decryptedToken,
        'camp_1',
        { timeRange: { since: '2026-01-01', until: '2026-01-31' } },
      );
      expect(result).toEqual(insights);
    });

    it('uses datePreset when provided instead of timeRange', async () => {
      metaAdsService.getCampaignInsights.mockResolvedValue({});

      await controller.getCampaignInsights(mockUser, 'camp_1', 'last_7d');

      expect(metaAdsService.getCampaignInsights).toHaveBeenCalledWith(
        decryptedToken,
        'camp_1',
        { datePreset: 'last_7d' },
      );
    });
  });
});
