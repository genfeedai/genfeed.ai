vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: vi.fn((val: string) => `decrypted:${val}`) },
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { MetaAdsController } from '@api/services/integrations/meta-ads/controllers/meta-ads.controller';
import { MetaAdsService } from '@api/services/integrations/meta-ads/services/meta-ads.service';
import { CredentialPlatform } from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { BadRequestException } from '@nestjs/common';
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
    updateAdSet: ReturnType<typeof vi.fn>;
    updateCampaign: ReturnType<typeof vi.fn>;
    uploadAdImage: ReturnType<typeof vi.fn>;
    uploadAdVideo: ReturnType<typeof vi.fn>;
  };
  let loggerService: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
  };

  const mockUser = {
    organizationId: testId('org'),
    userId: testId('user'),
  } as unknown as User;

  const mockCredential = {
    id: 'test-object-id',
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
      updateAdSet: vi.fn(),
      updateCampaign: vi.fn(),
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
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

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
      expect(metaAdsService.createCampaign).toHaveBeenCalledWith(
        decryptedToken,
        'act_123',
        expect.objectContaining({ status: 'PAUSED' }),
      );
      expect(result).toEqual({ id: 'camp_new_1' });
    });

    it('sends the paused status even when the caller omits one', async () => {
      metaAdsService.createCampaign.mockResolvedValue('camp_new_2');

      await controller.createCampaign(mockUser, {
        adAccountId: 'act_123',
        name: 'New Campaign',
        objective: 'LINK_CLICKS',
      } as never);

      expect(metaAdsService.createCampaign).toHaveBeenCalledWith(
        decryptedToken,
        'act_123',
        expect.objectContaining({ status: 'PAUSED' }),
      );
    });

    it.each(['ACTIVE', 'active', 'paused', 'ARCHIVED', ''])(
      'rejects creation with status "%s" before resolving a token',
      async (status) => {
        await expect(
          controller.createCampaign(mockUser, {
            adAccountId: 'act_123',
            name: 'Activating Campaign',
            objective: 'LINK_CLICKS',
            status,
          } as never),
        ).rejects.toBeInstanceOf(BadRequestException);

        expect(credentialsService.findOne).not.toHaveBeenCalled();
        expect(metaAdsService.createCampaign).not.toHaveBeenCalled();
      },
    );
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
        // An omitted status stays omitted so a rename cannot change serving state.
        { name: 'Updated', status: undefined },
      );
      expect(result).toEqual({ success: true });
    });

    it('pauses campaign via status field', async () => {
      metaAdsService.updateCampaign.mockResolvedValue(undefined);

      const result = await controller.updateCampaign(mockUser, 'camp_pause_1', {
        status: 'PAUSED',
      } as never);

      expect(metaAdsService.updateCampaign).toHaveBeenCalledWith(
        decryptedToken,
        'camp_pause_1',
        { status: 'PAUSED' },
      );
      expect(result).toEqual({ success: true });
    });

    it('updates budget fields via generic patch', async () => {
      metaAdsService.updateCampaign.mockResolvedValue(undefined);

      const result = await controller.updateCampaign(mockUser, 'camp_1', {
        dailyBudget: 50,
        lifetimeBudget: 1000,
      } as never);

      expect(metaAdsService.updateCampaign).toHaveBeenCalledWith(
        decryptedToken,
        'camp_1',
        { dailyBudget: 50, lifetimeBudget: 1000, status: undefined },
      );
      expect(result).toEqual({ success: true });
    });

    it.each(['ACTIVE', 'active', 'paused', 'ARCHIVED', ''])(
      'rejects an update with status "%s" before resolving a token',
      async (status) => {
        await expect(
          controller.updateCampaign(mockUser, 'camp_1', { status } as never),
        ).rejects.toBeInstanceOf(BadRequestException);

        expect(credentialsService.findOne).not.toHaveBeenCalled();
        expect(metaAdsService.updateCampaign).not.toHaveBeenCalled();
      },
    );
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
