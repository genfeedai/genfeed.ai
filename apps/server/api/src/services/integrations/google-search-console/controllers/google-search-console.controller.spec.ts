vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn(
    (_req: unknown, _serializer: unknown, data: { docs: unknown[] }) =>
      data.docs,
  ),
  serializeSingle: vi.fn(
    (_req: unknown, _serializer: unknown, data: unknown) => data,
  ),
}));

vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: vi.fn((value: string) => `decrypted:${value}`),
  },
}));

import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { GoogleSearchConsoleController } from '@api/services/integrations/google-search-console/controllers/google-search-console.controller';
import { GoogleSearchConsoleService } from '@api/services/integrations/google-search-console/services/google-search-console.service';
import { GoogleSearchConsoleOAuthService } from '@api/services/integrations/google-search-console/services/google-search-console-oauth.service';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { BadRequestException, HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('GoogleSearchConsoleController', () => {
  let controller: GoogleSearchConsoleController;
  let brandsService: { findOne: ReturnType<typeof vi.fn> };
  let credentialsService: {
    beginOAuthForBrand: ReturnType<typeof vi.fn>;
    connectAccount: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    findPendingOAuthCredential: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let oauthService: {
    exchangeAuthCodeForAccessToken: ReturnType<typeof vi.fn>;
    generateAuthUrl: ReturnType<typeof vi.fn>;
  };
  let gscService: {
    getSearchAnalytics: ReturnType<typeof vi.fn>;
    listSites: ReturnType<typeof vi.fn>;
  };

  const request = {} as Request;
  const user = {
    brandId: 'brand-id',
    id: 'auth-user-id',
    organizationId: 'org-id',
    userId: 'user-id',
  } as never;
  const brand = {
    id: 'brand-id',
    organizationId: 'org-id',
    userId: 'user-id',
  };
  const credential = {
    organizationId: 'org-id',
    id: 'credential-id',
    accessToken: 'encrypted-access-token',
    platform: 'google_search_console',
  };

  beforeEach(async () => {
    brandsService = {
      findOne: vi.fn().mockResolvedValue(brand),
    };
    credentialsService = {
      beginOAuthForBrand: vi.fn().mockResolvedValue({
        credential,
        state: 'opaque-oauth-state',
      }),
      connectAccount: vi
        .fn()
        .mockResolvedValue({ ...credential, isConnected: true }),
      findOne: vi.fn().mockResolvedValue(credential),
      findPendingOAuthCredential: vi.fn().mockResolvedValue(credential),
      patch: vi.fn().mockResolvedValue({ ...credential, isConnected: true }),
    };
    oauthService = {
      exchangeAuthCodeForAccessToken: vi.fn().mockResolvedValue({
        accessToken: 'access-token',
        expiresIn: 3600,
        refreshToken: 'refresh-token',
      }),
      generateAuthUrl: vi
        .fn()
        .mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth'),
    };
    gscService = {
      getSearchAnalytics: vi.fn().mockResolvedValue({
        id: 'analytics-id',
        dimensions: ['query'],
        endDate: '2026-06-29',
        rows: [{ clicks: 2, impressions: 10, keys: ['genfeed'], position: 4 }],
        siteUrl: 'https://genfeed.ai/',
        startDate: '2026-06-01',
      }),
      listSites: vi.fn().mockResolvedValue([
        {
          id: 'https://genfeed.ai/',
          permissionLevel: 'siteOwner',
          siteUrl: 'https://genfeed.ai/',
        },
      ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GoogleSearchConsoleController],
      providers: [
        { provide: BrandsService, useValue: brandsService },
        { provide: CredentialsService, useValue: credentialsService },
        { provide: GoogleSearchConsoleOAuthService, useValue: oauthService },
        { provide: GoogleSearchConsoleService, useValue: gscService },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
      ],
    }).compile();

    controller = module.get(GoogleSearchConsoleController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates a pending credential and returns an OAuth URL', async () => {
    const result = await controller.connect(request, user, {
      brandId: 'brand-id',
    });

    expect(brandsService.findOne).toHaveBeenCalledWith({
      id: 'brand-id',
      organizationId: 'org-id',
    });
    expect(credentialsService.beginOAuthForBrand).toHaveBeenCalledWith(
      brand,
      'user-id',
      'google_search_console',
      { isConnected: false },
    );
    expect(oauthService.generateAuthUrl).toHaveBeenCalledWith(
      'opaque-oauth-state',
    );
    expect(result).toEqual({
      url: 'https://accounts.google.com/o/oauth2/v2/auth',
    });
  });

  it('rejects connect when the brand is outside the organization', async () => {
    brandsService.findOne.mockResolvedValueOnce(null);

    await expect(
      controller.connect(request, user, { brandId: 'brand-id' }),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('verifies OAuth and stores the primary Search Console property', async () => {
    const result = await controller.verify(request, user, {
      code: 'auth-code',
      state: 'opaque-oauth-state',
    });

    expect(credentialsService.findPendingOAuthCredential).toHaveBeenCalledWith(
      'opaque-oauth-state',
      'google_search_console',
      {
        organizationId: 'org-id',
        userId: 'user-id',
      },
    );
    expect(oauthService.exchangeAuthCodeForAccessToken).toHaveBeenCalledWith(
      'auth-code',
    );
    expect(gscService.listSites).toHaveBeenCalledWith('access-token');
    expect(credentialsService.connectAccount).toHaveBeenCalledWith(
      'credential-id',
      'org-id',
      expect.objectContaining({
        handle: 'https://genfeed.ai/',
        id: 'https://genfeed.ai/',
      }),
      expect.objectContaining({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      }),
    );
    expect(result).toEqual({ ...credential, isConnected: true });
  });

  it('throws when verify payload is missing OAuth parameters', async () => {
    await expect(
      controller.verify(request, user, { code: 'auth-code' }),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('rejects an OAuth state not pending for the authenticated user', async () => {
    credentialsService.findPendingOAuthCredential.mockResolvedValueOnce(null);

    await expect(
      controller.verify(request, user, {
        code: 'auth-code',
        state: 'foreign-or-expired-state',
      }),
    ).rejects.toBeInstanceOf(HttpException);

    expect(oauthService.exchangeAuthCodeForAccessToken).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when the account has no verified Search Console properties', async () => {
    gscService.listSites.mockResolvedValueOnce([]);

    await expect(
      controller.verify(request, user, {
        code: 'auth-code',
        state: 'opaque-oauth-state',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(credentialsService.patch).not.toHaveBeenCalled();
  });

  it('lists connected Search Console sites using the stored token', async () => {
    const result = await controller.listSites(request, user, 'brand-id');

    expect(EncryptionUtil.decrypt).toHaveBeenCalledWith(
      'encrypted-access-token',
    );
    expect(gscService.listSites).toHaveBeenCalledWith(
      'decrypted:encrypted-access-token',
    );
    expect(result).toEqual([
      {
        id: 'https://genfeed.ai/',
        permissionLevel: 'siteOwner',
        siteUrl: 'https://genfeed.ai/',
      },
    ]);
  });

  it('pulls serialized Search Analytics for the requested property', async () => {
    const result = await controller.getSearchAnalytics(
      request,
      user,
      'https://genfeed.ai/',
      '2026-06-01',
      '2026-06-29',
      'query,page',
      '250',
      '10',
      'brand-id',
    );

    expect(gscService.getSearchAnalytics).toHaveBeenCalledWith(
      'decrypted:encrypted-access-token',
      {
        dimensions: ['query', 'page'],
        endDate: '2026-06-29',
        rowLimit: 250,
        siteUrl: 'https://genfeed.ai/',
        startDate: '2026-06-01',
        startRow: 10,
      },
    );
    expect(result).toEqual(
      expect.objectContaining({
        siteUrl: 'https://genfeed.ai/',
      }),
    );
  });

  it('throws when Search Analytics required query params are missing', async () => {
    await expect(
      controller.getSearchAnalytics(
        request,
        user,
        '',
        '2026-06-01',
        '2026-06-29',
      ),
    ).rejects.toBeInstanceOf(HttpException);
  });
});
