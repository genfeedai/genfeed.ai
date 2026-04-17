import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GoogleAdsService } from '../services/google-ads.service';
import { GoogleAdsOAuthService } from '../services/google-ads-oauth.service';
import { GoogleAdsController } from './google-ads.controller';

vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getPublicMetadata: vi.fn(() => ({
    organization: new Types.ObjectId().toString(),
    user: new Types.ObjectId().toString(),
  })),
}));

vi.mock('@api/shared/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: vi.fn((v: string) => `decrypted:${v}`),
  },
}));

const mockUser = {
  id: 'user_abc',
  publicMetadata: {
    organization: new Types.ObjectId().toString(),
    user: new Types.ObjectId().toString(),
  },
} as never;

const ACCESS_TOKEN = 'decrypted:encrypted-token';
const MOCK_CREDENTIAL = {
  accessToken: 'encrypted-token',
  isConnected: true,
  isDeleted: false,
  platform: CredentialPlatform.GOOGLE_ADS,
};

describe('GoogleAdsController', () => {
  let controller: GoogleAdsController;
  let brandsService: vi.Mocked<Pick<BrandsService, 'findOne'>>;
  let credentialsService: vi.Mocked<
    Pick<CredentialsService, 'findOne' | 'patch' | 'saveCredentials'>
  >;
  let googleAdsService: vi.Mocked<
    Pick<
      GoogleAdsService,
      | 'listAccessibleCustomers'
      | 'listCampaigns'
      | 'getCampaignMetrics'
      | 'getAdGroupInsights'
      | 'getKeywordPerformance'
      | 'getSearchTermsReport'
    >
  >;
  let googleAdsOAuthService: vi.Mocked<
    Pick<
      GoogleAdsOAuthService,
      'generateAuthUrl' | 'exchangeAuthCodeForAccessToken'
    >
  >;
  let loggerService: vi.Mocked<Pick<LoggerService, 'log' | 'error' | 'warn'>>;

  beforeEach(async () => {
    brandsService = {
      findOne: vi.fn().mockResolvedValue({
        _id: new Types.ObjectId(),
        organization: new Types.ObjectId(),
        user: new Types.ObjectId(),
      }),
    };
    credentialsService = {
      findOne: vi.fn().mockResolvedValue(MOCK_CREDENTIAL),
      patch: vi.fn().mockResolvedValue({ id: 'cred-1' }),
      saveCredentials: vi.fn(),
    };
    googleAdsService = {
      getAdGroupInsights: vi.fn().mockResolvedValue({ clicks: 50 }),
      getCampaignMetrics: vi.fn().mockResolvedValue({ impressions: 1000 }),
      getKeywordPerformance: vi
        .fn()
        .mockResolvedValue([{ keyword: 'ai content' }]),
      getSearchTermsReport: vi
        .fn()
        .mockResolvedValue([{ searchTerm: 'genfeed ai' }]),
      listAccessibleCustomers: vi.fn().mockResolvedValue([{ id: 'cust-1' }]),
      listCampaigns: vi.fn().mockResolvedValue([{ id: 'camp-1' }]),
    };
    googleAdsOAuthService = {
      exchangeAuthCodeForAccessToken: vi.fn().mockResolvedValue({
        accessToken: 'tok',
        expiresIn: 3600,
        refreshToken: 'ref',
        tokenType: 'Bearer',
      }),
      generateAuthUrl: vi
        .fn()
        .mockReturnValue('https://accounts.google.com/oauth'),
    };
    loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GoogleAdsController],
      providers: [
        { provide: BrandsService, useValue: brandsService },
        { provide: CredentialsService, useValue: credentialsService },
        { provide: GoogleAdsService, useValue: googleAdsService },
        { provide: GoogleAdsOAuthService, useValue: googleAdsOAuthService },
        { provide: LoggerService, useValue: loggerService },
      ],
    }).compile();

    controller = module.get<GoogleAdsController>(GoogleAdsController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── OAuth ──────────────────────────────────────────────────────────────────
  describe('getOAuthUrl', () => {
    it('returns generated auth URL', () => {
      const result = controller.getOAuthUrl('state-abc');
      expect(googleAdsOAuthService.generateAuthUrl).toHaveBeenCalledWith(
        'state-abc',
      );
      expect(result).toEqual({ url: 'https://accounts.google.com/oauth' });
    });
  });

  describe('handleOAuthCallback', () => {
    it('exchanges code for tokens', async () => {
      const result = await controller.handleOAuthCallback({
        code: 'auth-code',
      });
      expect(
        googleAdsOAuthService.exchangeAuthCodeForAccessToken,
      ).toHaveBeenCalledWith('auth-code');
      expect(result).toEqual({
        accessToken: 'tok',
        expiresIn: 3600,
        refreshToken: 'ref',
        tokenType: 'Bearer',
      });
    });
  });

  describe('verify', () => {
    it('persists verified credential using access token', async () => {
      googleAdsService.listAccessibleCustomers.mockResolvedValue([
        {
          currencyCode: 'USD',
          descriptiveName: 'Primary Account',
          id: '123',
          isManager: false,
          timeZone: 'UTC',
        },
      ] as never);

      const result = await controller.verify({} as never, {
        code: 'auth-code',
        state: JSON.stringify({
          brandId: new Types.ObjectId().toString(),
          organizationId: new Types.ObjectId().toString(),
        }),
      });

      expect(
        googleAdsOAuthService.exchangeAuthCodeForAccessToken,
      ).toHaveBeenCalledWith('auth-code');
      expect(credentialsService.patch).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('throws when code or state is missing', async () => {
      await expect(
        controller.verify({} as never, { code: 'auth-code' }),
      ).rejects.toBeInstanceOf(HttpException);
    });
  });

  // ── Customers ─────────────────────────────────────────────────────────────
  describe('listCustomers', () => {
    it('decrypts token and calls listAccessibleCustomers', async () => {
      const result = await controller.listCustomers(mockUser);
      expect(EncryptionUtil.decrypt).toHaveBeenCalledWith('encrypted-token');
      expect(googleAdsService.listAccessibleCustomers).toHaveBeenCalledWith(
        ACCESS_TOKEN,
      );
      expect(result).toEqual([{ id: 'cust-1' }]);
    });

    it('throws when credential is not found', async () => {
      credentialsService.findOne.mockResolvedValue(null);
      await expect(controller.listCustomers(mockUser)).rejects.toThrow(
        'Google Ads credential not found',
      );
    });
  });

  // ── Campaigns ─────────────────────────────────────────────────────────────
  describe('listCampaigns', () => {
    it('passes customerId, status, and limit to service', async () => {
      const result = await controller.listCampaigns(
        mockUser,
        'cust-1',
        'ENABLED',
        '10',
        undefined,
      );
      expect(googleAdsService.listCampaigns).toHaveBeenCalledWith(
        ACCESS_TOKEN,
        'cust-1',
        { limit: 10, status: 'ENABLED' },
        undefined,
      );
      expect(result).toEqual([{ id: 'camp-1' }]);
    });

    it('passes undefined limit when not supplied', async () => {
      await controller.listCampaigns(
        mockUser,
        'cust-1',
        undefined,
        undefined,
        undefined,
      );
      expect(googleAdsService.listCampaigns).toHaveBeenCalledWith(
        ACCESS_TOKEN,
        'cust-1',
        { limit: undefined, status: undefined },
        undefined,
      );
    });
  });

  // ── Campaign metrics ──────────────────────────────────────────────────────
  describe('getCampaignMetrics', () => {
    it('passes date range when both dates supplied', async () => {
      await controller.getCampaignMetrics(
        mockUser,
        'camp-1',
        'cust-1',
        '2024-01-01',
        '2024-01-31',
        undefined,
        undefined,
      );
      expect(googleAdsService.getCampaignMetrics).toHaveBeenCalledWith(
        ACCESS_TOKEN,
        'cust-1',
        'camp-1',
        { dateRange: { endDate: '2024-01-31', startDate: '2024-01-01' } },
        undefined,
      );
    });

    it('sets segmentByDate when query param is "true"', async () => {
      await controller.getCampaignMetrics(
        mockUser,
        'camp-1',
        'cust-1',
        '2024-01-01',
        '2024-01-31',
        'true',
        undefined,
      );
      expect(googleAdsService.getCampaignMetrics).toHaveBeenCalledWith(
        ACCESS_TOKEN,
        'cust-1',
        'camp-1',
        { dateRange: expect.any(Object), segmentByDate: true },
        undefined,
      );
    });
  });

  // ── Ad-group insights ─────────────────────────────────────────────────────
  describe('getAdGroupInsights', () => {
    it('delegates to googleAdsService', async () => {
      const result = await controller.getAdGroupInsights(
        mockUser,
        'ag-1',
        'cust-1',
        undefined,
        undefined,
        undefined,
      );
      expect(googleAdsService.getAdGroupInsights).toHaveBeenCalledWith(
        ACCESS_TOKEN,
        'cust-1',
        'ag-1',
        {},
        undefined,
      );
      expect(result).toEqual({ clicks: 50 });
    });
  });

  // ── Keywords ──────────────────────────────────────────────────────────────
  describe('getKeywordPerformance', () => {
    it('converts limit string to number', async () => {
      await controller.getKeywordPerformance(
        mockUser,
        'cust-1',
        undefined,
        undefined,
        '25',
        undefined,
      );
      expect(googleAdsService.getKeywordPerformance).toHaveBeenCalledWith(
        ACCESS_TOKEN,
        'cust-1',
        { limit: 25 },
        undefined,
      );
    });
  });

  // ── Search terms ──────────────────────────────────────────────────────────
  describe('getSearchTerms', () => {
    it('delegates with campaign id and params', async () => {
      const result = await controller.getSearchTerms(
        mockUser,
        'camp-2',
        'cust-1',
        '2024-01-01',
        '2024-01-31',
        '50',
        undefined,
      );
      expect(googleAdsService.getSearchTermsReport).toHaveBeenCalledWith(
        ACCESS_TOKEN,
        'cust-1',
        'camp-2',
        {
          dateRange: { endDate: '2024-01-31', startDate: '2024-01-01' },
          limit: 50,
        },
        undefined,
      );
      expect(result).toEqual([{ searchTerm: 'genfeed ai' }]);
    });
  });
});
