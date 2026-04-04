vi.mock('@api/helpers/decorators/swagger/auto-swagger.decorator', () => ({
  AutoSwagger: () => () => undefined,
}));
vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  extractRequestContext: vi.fn(() => ({
    organizationId: '507f1f77bcf86cd799439033',
    userId: '507f1f77bcf86cd799439044',
  })),
}));
vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: { getCallerName: vi.fn(() => 'testMethod') },
}));

import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { AdsGatewayController } from '@api/services/ads-gateway/ads-gateway.controller';
import { AdsGatewayService } from '@api/services/ads-gateway/ads-gateway.service';
import type { User } from '@clerk/backend';
import type { AdsAdapterContext } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

describe('AdsGatewayController', () => {
  let controller: AdsGatewayController;
  let adsGatewayService: {
    comparePlatforms: ReturnType<typeof vi.fn>;
    getAdapter: ReturnType<typeof vi.fn>;
  };
  let credentialsService: { findOne: ReturnType<typeof vi.fn> };
  let logger: { log: ReturnType<typeof vi.fn> };
  let mockAdapter: {
    createAd: ReturnType<typeof vi.fn>;
    createAdSet: ReturnType<typeof vi.fn>;
    createCampaign: ReturnType<typeof vi.fn>;
    getAdAccounts: ReturnType<typeof vi.fn>;
    getCampaignInsights: ReturnType<typeof vi.fn>;
    getTopPerformers: ReturnType<typeof vi.fn>;
    listAdSets: ReturnType<typeof vi.fn>;
    listAds: ReturnType<typeof vi.fn>;
    listCampaigns: ReturnType<typeof vi.fn>;
    pauseCampaign: ReturnType<typeof vi.fn>;
    updateCampaign: ReturnType<typeof vi.fn>;
  };

  const mockUser = {
    id: 'user_clerk_123',
    publicMetadata: {
      organization: '507f1f77bcf86cd799439033',
      user: '507f1f77bcf86cd799439044',
    },
  } as unknown as User;

  const validCredentialId = '507f1f77bcf86cd799439011';
  const validAdAccountId = 'act_12345';

  beforeEach(async () => {
    mockAdapter = {
      createAd: vi.fn(),
      createAdSet: vi.fn(),
      createCampaign: vi.fn(),
      getAdAccounts: vi.fn(),
      getCampaignInsights: vi.fn(),
      getTopPerformers: vi.fn(),
      listAdSets: vi.fn(),
      listAds: vi.fn(),
      listCampaigns: vi.fn(),
      pauseCampaign: vi.fn(),
      updateCampaign: vi.fn(),
    };

    adsGatewayService = {
      comparePlatforms: vi.fn(),
      getAdapter: vi.fn().mockReturnValue(mockAdapter),
    };

    credentialsService = {
      findOne: vi.fn().mockResolvedValue({ accessToken: 'token-abc' }),
    };

    logger = { log: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdsGatewayController],
      providers: [
        { provide: AdsGatewayService, useValue: adsGatewayService },
        { provide: CredentialsService, useValue: credentialsService },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    controller = module.get<AdsGatewayController>(AdsGatewayController);
    vi.clearAllMocks();
    // Re-stub after clearAllMocks
    adsGatewayService.getAdapter.mockReturnValue(mockAdapter);
    credentialsService.findOne.mockResolvedValue({ accessToken: 'token-abc' });
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ─── validatePlatform ─────────────────────────────────────────────────────

  describe('platform validation', () => {
    it('should throw BadRequestException for unknown platform', async () => {
      await expect(
        controller.getAdAccounts(mockUser, 'snapchat', validCredentialId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should accept "meta" as a valid platform', async () => {
      mockAdapter.getAdAccounts.mockResolvedValue([]);

      await expect(
        controller.getAdAccounts(mockUser, 'meta', validCredentialId),
      ).resolves.toBeDefined();
    });

    it('should accept "google" as a valid platform', async () => {
      mockAdapter.getAdAccounts.mockResolvedValue([]);

      await expect(
        controller.getAdAccounts(mockUser, 'google', validCredentialId),
      ).resolves.toBeDefined();
    });

    it('should accept "tiktok" as a valid platform', async () => {
      mockAdapter.getAdAccounts.mockResolvedValue([]);

      await expect(
        controller.getAdAccounts(mockUser, 'tiktok', validCredentialId),
      ).resolves.toBeDefined();
    });
  });

  // ─── resolveAccessToken ───────────────────────────────────────────────────

  describe('credential resolution', () => {
    it('should throw UnauthorizedException when credential not found', async () => {
      credentialsService.findOne.mockResolvedValue(null);

      await expect(
        controller.getAdAccounts(mockUser, 'meta', validCredentialId),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when credential has no accessToken', async () => {
      credentialsService.findOne.mockResolvedValue({ accessToken: null });

      await expect(
        controller.listCampaigns(
          mockUser,
          'meta',
          validCredentialId,
          validAdAccountId,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── getAdAccounts ────────────────────────────────────────────────────────

  describe('getAdAccounts', () => {
    it('should call adapter.getAdAccounts and return results', async () => {
      const mockAccounts = [{ id: 'act_1', name: 'Test Account' }];
      mockAdapter.getAdAccounts.mockResolvedValue(mockAccounts);

      const result = await controller.getAdAccounts(
        mockUser,
        'meta',
        validCredentialId,
      );

      expect(result).toEqual(mockAccounts);
      expect(adsGatewayService.getAdapter).toHaveBeenCalledWith('meta');
      expect(mockAdapter.getAdAccounts).toHaveBeenCalledWith(
        expect.objectContaining<Partial<AdsAdapterContext>>({
          accessToken: 'token-abc',
          credentialId: validCredentialId,
        }),
      );
    });
  });

  // ─── listCampaigns ────────────────────────────────────────────────────────

  describe('listCampaigns', () => {
    it('should call adapter.listCampaigns with correct context', async () => {
      const mockCampaigns = [{ id: 'camp_1', name: 'Summer Sale' }];
      mockAdapter.listCampaigns.mockResolvedValue(mockCampaigns);

      const result = await controller.listCampaigns(
        mockUser,
        'meta',
        validCredentialId,
        validAdAccountId,
      );

      expect(result).toEqual(mockCampaigns);
      expect(mockAdapter.listCampaigns).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: 'token-abc',
          adAccountId: validAdAccountId,
        }),
      );
    });
  });

  // ─── getCampaignInsights ─────────────────────────────────────────────────

  describe('getCampaignInsights', () => {
    it('should pass datePreset when provided', async () => {
      const mockInsights = { clicks: 1000, impressions: 50000 };
      mockAdapter.getCampaignInsights.mockResolvedValue(mockInsights);

      await controller.getCampaignInsights(
        mockUser,
        'meta',
        'camp_1',
        validCredentialId,
        validAdAccountId,
        'last_7d',
      );

      expect(mockAdapter.getCampaignInsights).toHaveBeenCalledWith(
        expect.anything(),
        'camp_1',
        expect.objectContaining({ datePreset: 'last_7d' }),
      );
    });

    it('should pass timeRange when since and until are provided', async () => {
      mockAdapter.getCampaignInsights.mockResolvedValue({});

      await controller.getCampaignInsights(
        mockUser,
        'meta',
        'camp_1',
        validCredentialId,
        validAdAccountId,
        undefined,
        '2026-03-01',
        '2026-03-14',
      );

      expect(mockAdapter.getCampaignInsights).toHaveBeenCalledWith(
        expect.anything(),
        'camp_1',
        expect.objectContaining({
          timeRange: { since: '2026-03-01', until: '2026-03-14' },
        }),
      );
    });
  });

  // ─── pauseCampaign ────────────────────────────────────────────────────────

  describe('pauseCampaign', () => {
    it('should call adapter.pauseCampaign and return { success: true }', async () => {
      mockAdapter.pauseCampaign.mockResolvedValue(undefined);

      const result = await controller.pauseCampaign(
        mockUser,
        'meta',
        'camp_2',
        {
          adAccountId: validAdAccountId,
          credentialId: validCredentialId,
        },
      );

      expect(result).toEqual({ success: true });
      expect(mockAdapter.pauseCampaign).toHaveBeenCalledWith(
        expect.objectContaining({ adAccountId: validAdAccountId }),
        'camp_2',
      );
    });
  });

  // ─── comparePlatforms ────────────────────────────────────────────────────

  describe('comparePlatforms', () => {
    it('should throw BadRequestException if arrays have mismatched lengths', async () => {
      await expect(
        controller.comparePlatforms(
          mockUser,
          'meta,google',
          validCredentialId, // only 1 credentialId for 2 platforms
          `${validAdAccountId},act_2`,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should call adsGatewayService.comparePlatforms with built contexts', async () => {
      const credId2 = '507f1f77bcf86cd799439022';
      credentialsService.findOne
        .mockResolvedValueOnce({ accessToken: 'token-meta' })
        .mockResolvedValueOnce({ accessToken: 'token-google' });

      adsGatewayService.comparePlatforms.mockResolvedValue({ summary: {} });

      const result = await controller.comparePlatforms(
        mockUser,
        'meta,google',
        `${validCredentialId},${credId2}`,
        `${validAdAccountId},act_2`,
        'last_30d',
      );

      expect(result).toEqual({ summary: {} });
      expect(adsGatewayService.comparePlatforms).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ platform: 'meta' }),
          expect.objectContaining({ platform: 'google' }),
        ]),
        'last_30d',
      );
    });
  });
});
