import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { GoogleAdsService } from '@api/services/integrations/google-ads/services/google-ads.service';
import { GoogleAdsOAuthService } from '@api/services/integrations/google-ads/services/google-ads-oauth.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import {
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { isAxiosError } from 'axios';
import { GoogleAdsController } from './google-ads.controller';

vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: vi.fn((v: string) => `decrypted:${v}`),
  },
}));

const mockUser = {
  id: 'user_abc',
  organizationId: 'test-object-id',
  userId: 'test-object-id',
} as never;

const ACCESS_TOKEN = 'decrypted:encrypted-token';
const MOCK_CREDENTIAL = {
  accessToken: 'encrypted-token',
  brandId: 'test-object-id',
  id: 'cred-1',
  isConnected: true,
  isDeleted: false,
  organizationId: 'test-object-id',
  platform: CredentialPlatform.GOOGLE_ADS,
  userId: 'test-object-id',
};

describe('GoogleAdsController', () => {
  let controller: GoogleAdsController;
  let brandsService: vi.Mocked<Pick<BrandsService, 'findOne'>>;
  let credentialsService: vi.Mocked<
    Pick<
      CredentialsService,
      | 'beginOAuthForBrand'
      | 'connectAccount'
      | 'findOne'
      | 'findPendingOAuthCredential'
      | 'patch'
    >
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
      'generateAuthUrl' | 'exchangeAuthCodeForAccessToken' | 'requireConfigured'
    >
  >;
  let loggerService: vi.Mocked<Pick<LoggerService, 'log' | 'error' | 'warn'>>;

  beforeEach(async () => {
    brandsService = {
      findOne: vi.fn().mockResolvedValue({
        id: 'test-object-id',
        organizationId: 'test-object-id',
        userId: 'test-object-id',
      }),
    };
    credentialsService = {
      beginOAuthForBrand: vi.fn().mockResolvedValue({
        credential: MOCK_CREDENTIAL,
        state: 'opaque-oauth-state',
      }),
      connectAccount: vi.fn().mockResolvedValue({ id: 'cred-1' }),
      findOne: vi.fn().mockResolvedValue(MOCK_CREDENTIAL),
      findPendingOAuthCredential: vi.fn().mockResolvedValue(MOCK_CREDENTIAL),
      patch: vi.fn().mockResolvedValue({ id: 'cred-1' }),
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
      requireConfigured: vi.fn(),
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
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<GoogleAdsController>(GoogleAdsController);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAxiosError).mockReturnValue(false);
  });

  describe('verify', () => {
    beforeEach(() => {
      vi.mocked(isAxiosError).mockImplementation(
        (value: unknown): value is never =>
          (value as { isAxiosError?: boolean } | null)?.isAxiosError === true,
      );
    });

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

      const result = await controller.verify({} as never, mockUser, {
        code: 'auth-code',
        state: 'opaque-oauth-state',
      });

      expect(
        credentialsService.findPendingOAuthCredential,
      ).toHaveBeenCalledWith(
        'opaque-oauth-state',
        CredentialPlatform.GOOGLE_ADS,
        {
          organizationId: 'test-object-id',
          userId: 'test-object-id',
        },
      );
      expect(
        googleAdsOAuthService.exchangeAuthCodeForAccessToken,
      ).toHaveBeenCalledWith('auth-code');
      expect(credentialsService.connectAccount).toHaveBeenCalledWith(
        'cred-1',
        'test-object-id',
        expect.objectContaining({ id: '123' }),
        expect.objectContaining({ accessToken: expect.any(String) }),
      );
      expect(result).toBeDefined();
    });

    it('throws when code or state is missing', async () => {
      await expect(
        controller.verify({} as never, mockUser, { code: 'auth-code' }),
      ).rejects.toBeInstanceOf(HttpException);
    });

    it('rejects a state that is not pending in the caller scope', async () => {
      credentialsService.findPendingOAuthCredential.mockResolvedValueOnce(null);

      await expect(
        controller.verify({} as never, mockUser, {
          code: 'auth-code',
          state: 'foreign-or-expired-state',
        }),
      ).rejects.toBeInstanceOf(HttpException);

      // The token exchange must never run for a cross-org state.
      expect(
        googleAdsOAuthService.exchangeAuthCodeForAccessToken,
      ).not.toHaveBeenCalled();
    });

    const providerError = (status: number) =>
      Object.assign(new Error(`Request failed with status code ${status}`), {
        isAxiosError: true,
        response: { data: { error: 'invalid_grant' }, status },
      });

    it.each([
      [401, HttpStatus.BAD_REQUEST],
      [400, HttpStatus.BAD_REQUEST],
      [503, HttpStatus.BAD_GATEWAY],
    ])(
      'maps a %i provider failure during token exchange to a %i HttpException',
      async (providerStatus, expectedStatus) => {
        googleAdsOAuthService.exchangeAuthCodeForAccessToken.mockRejectedValueOnce(
          providerError(providerStatus),
        );

        const error = await controller
          .verify({} as never, mockUser, {
            code: 'auth-code',
            state: 'opaque-oauth-state',
          })
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(expectedStatus);
        expect((error as HttpException).getResponse()).toMatchObject({
          title: 'Token exchange failed',
        });
        expect(credentialsService.connectAccount).not.toHaveBeenCalled();
      },
    );

    it('maps a rejected customer lookup to a client-safe HttpException', async () => {
      googleAdsService.listAccessibleCustomers.mockRejectedValueOnce(
        providerError(401),
      );

      const error = await controller
        .verify({} as never, mockUser, {
          code: 'auth-code',
          state: 'opaque-oauth-state',
        })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect((error as HttpException).getResponse()).toMatchObject({
        title: 'Customer lookup failed',
      });
      expect(credentialsService.connectAccount).not.toHaveBeenCalled();
    });

    it('passes an HttpException from the exchange through unchanged', async () => {
      const notConfigured = new ServiceUnavailableException('not configured');
      googleAdsOAuthService.exchangeAuthCodeForAccessToken.mockRejectedValueOnce(
        notConfigured,
      );

      await expect(
        controller.verify({} as never, mockUser, {
          code: 'auth-code',
          state: 'opaque-oauth-state',
        }),
      ).rejects.toBe(notConfigured);
    });
  });

  // Customers
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

  // Campaigns
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

  // Campaign metrics
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

  // Ad-group insights
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

  // Keywords
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

  // Search terms
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
