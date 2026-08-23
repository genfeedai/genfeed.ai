vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn((_request, _serializer, data) => ({ data })),
}));

vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: vi.fn((value: string) => value) },
}));

import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { XAdsController } from '@api/services/integrations/x-ads/controllers/x-ads.controller';
import { XAdsService } from '@api/services/integrations/x-ads/services/x-ads.service';
import { XAdsOAuthService } from '@api/services/integrations/x-ads/services/x-ads-oauth.service';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import {
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

const recordedAccountFixtures = {
  multiple: [
    {
      approvalStatus: 'ACCEPTED',
      currency: 'USD',
      id: 'account-z',
      name: 'Last by id',
      timezone: 'UTC',
    },
    {
      approvalStatus: 'ACCEPTED',
      currency: 'EUR',
      id: 'account-a',
      name: 'First by id',
      timezone: 'Europe/Malta',
    },
  ],
  one: [
    {
      approvalStatus: 'ACCEPTED',
      currency: 'USD',
      id: 'account-1',
      name: 'Primary X Ads account',
      timezone: 'UTC',
    },
  ],
  zero: [],
} as const;

describe('XAdsController', () => {
  let brandsService: { findOne: ReturnType<typeof vi.fn> };
  let controller: XAdsController;
  let credentialsService: {
    beginOAuthForBrand: ReturnType<typeof vi.fn>;
    findPendingOAuthCredential: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let xAdsOAuthService: {
    exchangeAuthCodeForAccessToken: ReturnType<typeof vi.fn>;
    generateAuthLink: ReturnType<typeof vi.fn>;
  };
  let xAdsService: { getAdAccounts: ReturnType<typeof vi.fn> };

  const user = {
    id: 'user-1',
    organizationId: 'org-1',
    userId: 'user-1',
  } as never;

  beforeEach(async () => {
    vi.mocked(EncryptionUtil.decrypt).mockImplementation(
      (value: string) => value,
    );
    brandsService = {
      findOne: vi.fn().mockResolvedValue({ id: 'brand-1' }),
    };
    credentialsService = {
      beginOAuthForBrand: vi.fn().mockResolvedValue({
        credential: { id: 'credential-1' },
        state: 'opaque-state',
      }),
      findPendingOAuthCredential: vi.fn().mockResolvedValue({
        id: 'credential-1',
        oauthTokenSecret: 'pkce-verifier',
      }),
      patch: vi.fn().mockResolvedValue({ id: 'credential-1' }),
    };
    xAdsOAuthService = {
      exchangeAuthCodeForAccessToken: vi.fn().mockResolvedValue({
        accessToken: 'access-token',
        expiresIn: 7200,
        refreshToken: 'refresh-token',
        scope: 'ads.read ads.write offline.access',
      }),
      generateAuthLink: vi.fn().mockReturnValue({
        codeVerifier: 'pkce-verifier',
        url: 'https://x.com/i/oauth2/authorize',
      }),
    };
    xAdsService = {
      getAdAccounts: vi.fn().mockResolvedValue(recordedAccountFixtures.one),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [XAdsController],
      providers: [
        { provide: BrandsService, useValue: brandsService },
        { provide: CredentialsService, useValue: credentialsService },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
        { provide: XAdsOAuthService, useValue: xAdsOAuthService },
        { provide: XAdsService, useValue: xAdsService },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(XAdsController);
  });

  it('scopes OAuth brand ownership to an active row in the caller organization', async () => {
    await controller.connect({} as never, user, { brandId: 'brand-1' });

    expect(brandsService.findOne).toHaveBeenCalledWith({
      id: 'brand-1',
      isDeleted: false,
      organizationId: 'org-1',
    });
    expect(credentialsService.beginOAuthForBrand).toHaveBeenCalledWith(
      { id: 'brand-1' },
      'user-1',
      CredentialPlatform.X_ADS,
      { isConnected: false },
    );
  });

  it('preserves a typed unavailable response when OAuth is not configured', async () => {
    xAdsOAuthService.generateAuthLink.mockImplementation(() => {
      throw new ServiceUnavailableException('X Ads OAuth is not configured');
    });

    const failure = await controller
      .connect({} as never, user, { brandId: 'brand-1' })
      .then(
        () => null,
        (error: unknown) => error,
      );

    expect(failure).toBeInstanceOf(ServiceUnavailableException);
    expect((failure as HttpException).getStatus()).toBe(
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  });

  it('keeps unexpected OAuth initialization errors behind the generic response', async () => {
    xAdsOAuthService.generateAuthLink.mockImplementation(() => {
      throw new Error('provider details');
    });

    const failure = await controller
      .connect({} as never, user, { brandId: 'brand-1' })
      .then(
        () => null,
        (error: unknown) => error,
      );

    expect(failure).toBeInstanceOf(HttpException);
    expect((failure as HttpException).getStatus()).toBe(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  });

  it('verifies only the pending OAuth state in the caller scope', async () => {
    await controller.verify({} as never, user, {
      code: 'authorization-code',
      state: 'opaque-state',
    });

    expect(credentialsService.findPendingOAuthCredential).toHaveBeenCalledWith(
      'opaque-state',
      CredentialPlatform.X_ADS,
      { organizationId: 'org-1', userId: 'user-1' },
    );
    expect(credentialsService.patch).toHaveBeenCalledWith(
      'credential-1',
      expect.objectContaining({
        externalId: 'account-1',
        grantedScopes: ['ads.read', 'ads.write', 'offline.access'],
        isConnected: true,
        isDeleted: false,
      }),
    );
  });

  it('fails verification without connecting when X returns no ad account', async () => {
    xAdsService.getAdAccounts.mockResolvedValue(recordedAccountFixtures.zero);

    const failure = await controller
      .verify({} as never, user, {
        code: 'authorization-code',
        state: 'opaque-state',
      })
      .then(
        () => null,
        (error: unknown) => error,
      );

    expect(failure).toBeInstanceOf(HttpException);
    expect((failure as HttpException).getStatus()).toBe(HttpStatus.BAD_GATEWAY);
    expect(credentialsService.patch).not.toHaveBeenCalled();
  });

  it('selects multiple X Ads accounts deterministically by account id', async () => {
    xAdsService.getAdAccounts.mockResolvedValue(
      recordedAccountFixtures.multiple,
    );

    await controller.verify({} as never, user, {
      code: 'authorization-code',
      state: 'opaque-state',
    });

    expect(credentialsService.patch).toHaveBeenCalledWith(
      'credential-1',
      expect.objectContaining({
        externalHandle: 'First by id',
        externalId: 'account-a',
        externalName: 'First by id',
        isConnected: true,
      }),
    );
  });

  it('maps PKCE decryption failure without leaking ciphertext details', async () => {
    vi.mocked(EncryptionUtil.decrypt).mockImplementationOnce(() => {
      throw new Error('ciphertext payload details');
    });

    const failure = await controller
      .verify({} as never, user, {
        code: 'authorization-code',
        state: 'opaque-state',
      })
      .then(
        () => null,
        (error: unknown) => error,
      );

    expect(failure).toBeInstanceOf(HttpException);
    expect((failure as HttpException).getStatus()).toBe(HttpStatus.BAD_GATEWAY);
    expect(
      JSON.stringify((failure as HttpException).getResponse()),
    ).not.toContain('ciphertext payload details');
    expect(
      xAdsOAuthService.exchangeAuthCodeForAccessToken,
    ).not.toHaveBeenCalled();
  });

  it('maps raw provider verification errors to a stable client response', async () => {
    xAdsOAuthService.exchangeAuthCodeForAccessToken.mockRejectedValue(
      new Error('provider request headers and token details'),
    );

    const failure = await controller
      .verify({} as never, user, {
        code: 'authorization-code',
        state: 'opaque-state',
      })
      .then(
        () => null,
        (error: unknown) => error,
      );

    expect(failure).toBeInstanceOf(HttpException);
    expect((failure as HttpException).getStatus()).toBe(HttpStatus.BAD_GATEWAY);
    expect(
      JSON.stringify((failure as HttpException).getResponse()),
    ).not.toContain('provider request headers and token details');
    expect(credentialsService.patch).not.toHaveBeenCalled();
  });
});
