vi.mock('@api/helpers/decorators/swagger/auto-swagger.decorator', () => ({
  AutoSwagger: () => () => undefined,
}));

import { testId } from '@helpers/testing/test-id.helper';

vi.mock('@api/helpers/utils/auth/auth.util', () => ({
  extractRequestContext: vi.fn(() => ({
    organizationId: 'corg000000000000000000001',
    userId: 'cuser000000000000000000001',
  })),
}));
vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: { getCallerName: vi.fn(() => 'testMethod') },
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { AdsGatewayController } from '@api/services/ads-gateway/ads-gateway.controller';
import { AdsGatewayService } from '@api/services/ads-gateway/ads-gateway.service';
import { AdsGatewayRequestContextService } from '@api/services/ads-gateway/ads-gateway-request-context.service';
import { INVALID_ADS_INSIGHTS_DATE_RANGE_MESSAGE } from '@api/services/ads-gateway/ads-insights-range.util';
import {
  CredentialPlatform,
  toPrismaCredentialPlatform,
} from '@genfeedai/contracts';
import type { AdsAdapterContext } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

const FIXED_NOW = new Date('2026-08-19T12:00:00.000Z');

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
    getAdInsights: ReturnType<typeof vi.fn>;
    getAdSetInsights: ReturnType<typeof vi.fn>;
    getCampaignInsights: ReturnType<typeof vi.fn>;
    getTopPerformers: ReturnType<typeof vi.fn>;
    listAdSets: ReturnType<typeof vi.fn>;
    listAds: ReturnType<typeof vi.fn>;
    listCampaigns: ReturnType<typeof vi.fn>;
    updateCampaign: ReturnType<typeof vi.fn>;
  };

  const mockUser = {
    id: 'user_authProvider_123',
    organizationId: testId('org'),
    userId: testId('user'),
  } as unknown as User;

  const validCredentialId = testId('credential');
  const validAdAccountId = 'act_12345';

  beforeEach(async () => {
    mockAdapter = {
      createAd: vi.fn(),
      createAdSet: vi.fn(),
      createCampaign: vi.fn(),
      getAdAccounts: vi.fn(),
      getAdInsights: vi.fn(),
      getAdSetInsights: vi.fn(),
      getCampaignInsights: vi.fn(),
      getTopPerformers: vi.fn(),
      listAdSets: vi.fn(),
      listAds: vi.fn(),
      listCampaigns: vi.fn(),
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
        AdsGatewayRequestContextService,
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AdsGatewayController>(AdsGatewayController);
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    // Re-stub after clearAllMocks
    adsGatewayService.getAdapter.mockReturnValue(mockAdapter);
    credentialsService.findOne.mockResolvedValue({ accessToken: 'token-abc' });
  });

  afterEach(() => {
    vi.useRealTimers();
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
      expect(credentialsService.findOne).not.toHaveBeenCalled();
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
    it.each([
      ['meta', CredentialPlatform.FACEBOOK],
      ['google', CredentialPlatform.GOOGLE_ADS],
      ['tiktok', CredentialPlatform.TIKTOK],
      ['x', CredentialPlatform.X_ADS],
    ] as const)(
      'scopes a %s credential to an active connected provider row',
      async (platform, credentialPlatform) => {
        if (platform === 'x') {
          credentialsService.findOne.mockResolvedValue({
            accessToken: 'token-abc',
            accessTokenSecret: 'token-secret-abc',
          });
        }
        mockAdapter.getAdAccounts.mockResolvedValue([]);

        await controller.getAdAccounts(mockUser, platform, validCredentialId);

        expect(credentialsService.findOne).toHaveBeenCalledWith({
          id: validCredentialId,
          isConnected: true,
          isDeleted: false,
          organizationId: 'corg000000000000000000001',
          platform: toPrismaCredentialPlatform(credentialPlatform),
        });
      },
    );

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

    it('decrypts the stored access token before passing it to the adapter', async () => {
      const encrypted = EncryptionUtil.encrypt('plaintext-meta-token');
      credentialsService.findOne.mockResolvedValue({ accessToken: encrypted });
      mockAdapter.getAdAccounts.mockResolvedValue([]);

      await controller.getAdAccounts(mockUser, 'meta', validCredentialId);

      expect(mockAdapter.getAdAccounts).toHaveBeenCalledWith(
        expect.objectContaining({ accessToken: 'plaintext-meta-token' }),
      );
    });

    it('decrypts both OAuth 1.0a credentials for X Ads only', async () => {
      credentialsService.findOne.mockResolvedValue({
        accessToken: EncryptionUtil.encrypt('x-access-token'),
        accessTokenSecret: EncryptionUtil.encrypt('x-access-token-secret'),
      });
      mockAdapter.getAdAccounts.mockResolvedValue([]);

      await controller.getAdAccounts(mockUser, 'x', validCredentialId);

      expect(mockAdapter.getAdAccounts).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: 'x-access-token',
          accessTokenSecret: 'x-access-token-secret',
        }),
      );
    });

    it('fails closed when an X Ads credential has no token secret', async () => {
      credentialsService.findOne.mockResolvedValue({
        accessToken: EncryptionUtil.encrypt('x-access-token'),
        accessTokenSecret: null,
      });

      await expect(
        controller.getAdAccounts(mockUser, 'x', validCredentialId),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockAdapter.getAdAccounts).not.toHaveBeenCalled();
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
    it('normalizes last_7d to one inclusive seven-day timeRange before the adapter', async () => {
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
        {
          timeRange: { since: '2026-08-12', until: '2026-08-18' },
        },
      );
    });

    it('normalizes today to one inclusive UTC day that is not reversed', async () => {
      mockAdapter.getCampaignInsights.mockResolvedValue({});

      await controller.getCampaignInsights(
        mockUser,
        'meta',
        'camp_1',
        validCredentialId,
        validAdAccountId,
        'today',
      );

      expect(mockAdapter.getCampaignInsights).toHaveBeenCalledWith(
        expect.anything(),
        'camp_1',
        {
          timeRange: { since: '2026-08-19', until: '2026-08-19' },
        },
      );
    });

    it('normalizes yesterday to the prior UTC calendar day', async () => {
      mockAdapter.getCampaignInsights.mockResolvedValue({});

      await controller.getCampaignInsights(
        mockUser,
        'meta',
        'camp_1',
        validCredentialId,
        validAdAccountId,
        'yesterday',
      );

      expect(mockAdapter.getCampaignInsights).toHaveBeenCalledWith(
        expect.anything(),
        'camp_1',
        {
          timeRange: { since: '2026-08-18', until: '2026-08-18' },
        },
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

    it('accepts a same-day custom range as one inclusive day', async () => {
      mockAdapter.getCampaignInsights.mockResolvedValue({});

      await controller.getCampaignInsights(
        mockUser,
        'meta',
        'camp_1',
        validCredentialId,
        validAdAccountId,
        undefined,
        '2026-03-07',
        '2026-03-07',
      );

      expect(mockAdapter.getCampaignInsights).toHaveBeenCalledWith(
        expect.anything(),
        'camp_1',
        {
          timeRange: { since: '2026-03-07', until: '2026-03-07' },
        },
      );
    });
  });

  describe('insight date validation', () => {
    async function expectRejectedBeforeAdapter(
      action: () => Promise<unknown>,
    ): Promise<void> {
      await expect(action()).rejects.toThrow(BadRequestException);
      await expect(action()).rejects.toThrow(
        INVALID_ADS_INSIGHTS_DATE_RANGE_MESSAGE,
      );
      expect(credentialsService.findOne).not.toHaveBeenCalled();
      expect(adsGatewayService.getAdapter).not.toHaveBeenCalled();
      expect(mockAdapter.getCampaignInsights).not.toHaveBeenCalled();
      expect(mockAdapter.getAdSetInsights).not.toHaveBeenCalled();
      expect(mockAdapter.getAdInsights).not.toHaveBeenCalled();
      expect(adsGatewayService.comparePlatforms).not.toHaveBeenCalled();
    }

    it.each([
      ['unknown preset', 'last_quarter', undefined, undefined],
      ['malformed since', undefined, 'not-a-date', '2026-03-07'],
      ['non-calendar since', undefined, '2026-02-30', '2026-03-01'],
      ['partial since', undefined, '2026-03-01', undefined],
      ['partial until', undefined, undefined, '2026-03-07'],
      ['reversed range', undefined, '2026-03-07', '2026-03-01'],
      ['mixed preset and custom', 'last_7d', '2026-03-01', '2026-03-07'],
    ] as const)(
      'rejects %s on campaign insights before any adapter call',
      async (_label, datePreset, since, until) => {
        await expectRejectedBeforeAdapter(() =>
          controller.getCampaignInsights(
            mockUser,
            'meta',
            'camp_1',
            validCredentialId,
            validAdAccountId,
            datePreset,
            since,
            until,
          ),
        );
      },
    );

    it('rejects an unknown preset on ad set insights before any adapter call', async () => {
      await expectRejectedBeforeAdapter(() =>
        controller.getAdSetInsights(
          mockUser,
          'google',
          'adset_1',
          validCredentialId,
          validAdAccountId,
          'last_quarter',
        ),
      );
    });

    it('rejects a reversed custom range on ad insights before any adapter call', async () => {
      await expectRejectedBeforeAdapter(() =>
        controller.getAdInsights(
          mockUser,
          'meta',
          'ad_1',
          validCredentialId,
          validAdAccountId,
          undefined,
          '2026-03-07',
          '2026-03-01',
        ),
      );
    });

    it('rejects an unknown preset on compare before fan-out', async () => {
      await expectRejectedBeforeAdapter(() =>
        controller.comparePlatforms(
          mockUser,
          'meta,google',
          `${validCredentialId},${testId('credential', 2)}`,
          `${validAdAccountId},act_2`,
          'last_quarter',
        ),
      );
    });

    it('rejects mixed preset and custom range on compare before fan-out', async () => {
      await expectRejectedBeforeAdapter(() =>
        controller.comparePlatforms(
          mockUser,
          'meta,google',
          `${validCredentialId},${testId('credential', 2)}`,
          `${validAdAccountId},act_2`,
          'last_7d',
          '2026-03-01',
          '2026-03-07',
        ),
      );
    });
  });

  // ─── getAdSetInsights ────────────────────────────────────────────────────

  describe('getAdSetInsights', () => {
    it('should resolve the adapter for any supported platform', async () => {
      mockAdapter.getAdSetInsights.mockResolvedValue({ clicks: 12 });

      const result = await controller.getAdSetInsights(
        mockUser,
        'tiktok',
        'adset_1',
        validCredentialId,
        validAdAccountId,
        'last_14d',
      );

      expect(result).toEqual({ clicks: 12 });
      expect(adsGatewayService.getAdapter).toHaveBeenCalledWith('tiktok');
      expect(mockAdapter.getAdSetInsights).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: 'token-abc',
          adAccountId: validAdAccountId,
        }),
        'adset_1',
        { timeRange: { since: '2026-08-05', until: '2026-08-18' } },
      );
    });

    it('should reject an unsupported platform', async () => {
      await expect(
        controller.getAdSetInsights(
          mockUser,
          'snapchat',
          'adset_1',
          validCredentialId,
          validAdAccountId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a partial custom range instead of dropping the bound', async () => {
      await expect(
        controller.getAdSetInsights(
          mockUser,
          'google',
          'adset_1',
          validCredentialId,
          validAdAccountId,
          undefined,
          '2026-03-01',
        ),
      ).rejects.toThrow(INVALID_ADS_INSIGHTS_DATE_RANGE_MESSAGE);

      expect(mockAdapter.getAdSetInsights).not.toHaveBeenCalled();
      expect(credentialsService.findOne).not.toHaveBeenCalled();
    });
  });

  // ─── getAdInsights ───────────────────────────────────────────────────────

  describe('getAdInsights', () => {
    it('should pass a custom time range through to the adapter', async () => {
      mockAdapter.getAdInsights.mockResolvedValue({ clicks: 3 });

      const result = await controller.getAdInsights(
        mockUser,
        'meta',
        'ad_1',
        validCredentialId,
        validAdAccountId,
        undefined,
        '2026-03-01',
        '2026-03-14',
      );

      expect(result).toEqual({ clicks: 3 });
      expect(mockAdapter.getAdInsights).toHaveBeenCalledWith(
        expect.anything(),
        'ad_1',
        { timeRange: { since: '2026-03-01', until: '2026-03-14' } },
      );
    });

    it('should forward loginCustomerId on the adapter context', async () => {
      mockAdapter.getAdInsights.mockResolvedValue({});

      await controller.getAdInsights(
        mockUser,
        'google',
        'ad_1',
        validCredentialId,
        validAdAccountId,
        'last_30d',
        undefined,
        undefined,
        '1112223334',
      );

      expect(mockAdapter.getAdInsights).toHaveBeenCalledWith(
        expect.objectContaining({ loginCustomerId: '1112223334' }),
        'ad_1',
        { timeRange: { since: '2026-07-20', until: '2026-08-18' } },
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

    it('fans one validated seven-day range to comparePlatforms', async () => {
      const credId2 = testId('credential', 2);
      credentialsService.findOne
        .mockResolvedValueOnce({ accessToken: 'token-meta' })
        .mockResolvedValueOnce({ accessToken: 'token-google' });
      adsGatewayService.comparePlatforms.mockResolvedValue({ summary: {} });

      await controller.comparePlatforms(
        mockUser,
        'meta,google',
        `${validCredentialId},${credId2}`,
        `${validAdAccountId},act_2`,
        'last_7d',
      );

      expect(adsGatewayService.comparePlatforms).toHaveBeenCalledTimes(1);
      expect(adsGatewayService.comparePlatforms).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ platform: 'meta' }),
          expect.objectContaining({ platform: 'google' }),
        ]),
        { timeRange: { since: '2026-08-12', until: '2026-08-18' } },
      );
    });

    it('fans one validated one-day range to comparePlatforms', async () => {
      const credId2 = testId('credential', 2);
      credentialsService.findOne
        .mockResolvedValueOnce({ accessToken: 'token-meta' })
        .mockResolvedValueOnce({ accessToken: 'token-google' });
      adsGatewayService.comparePlatforms.mockResolvedValue({ summary: {} });

      await controller.comparePlatforms(
        mockUser,
        'meta,google',
        `${validCredentialId},${credId2}`,
        `${validAdAccountId},act_2`,
        'today',
      );

      expect(adsGatewayService.comparePlatforms).toHaveBeenCalledWith(
        expect.anything(),
        { timeRange: { since: '2026-08-19', until: '2026-08-19' } },
      );
    });

    it('should call adsGatewayService.comparePlatforms with built contexts', async () => {
      const credId2 = testId('credential', 2);
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
        { timeRange: { since: '2026-07-20', until: '2026-08-18' } },
      );
      expect(credentialsService.findOne).toHaveBeenNthCalledWith(1, {
        id: validCredentialId,
        isConnected: true,
        isDeleted: false,
        organizationId: 'corg000000000000000000001',
        platform: toPrismaCredentialPlatform(CredentialPlatform.FACEBOOK),
      });
      expect(credentialsService.findOne).toHaveBeenNthCalledWith(2, {
        id: credId2,
        isConnected: true,
        isDeleted: false,
        organizationId: 'corg000000000000000000001',
        platform: toPrismaCredentialPlatform(CredentialPlatform.GOOGLE_ADS),
      });
    });
  });
});
