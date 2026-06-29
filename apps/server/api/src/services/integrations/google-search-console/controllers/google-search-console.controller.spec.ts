vi.mock('@api/helpers/utils/auth/auth.util', () => ({
  getPublicMetadata: vi.fn(() => ({
    organization: 'org-id',
    user: 'user-id',
  })),
}));

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn(
    (_req: unknown, _serializer: unknown, data: { docs: unknown[] }) =>
      data.docs,
  ),
  serializeSingle: vi.fn(
    (_req: unknown, _serializer: unknown, data: unknown) => data,
  ),
}));

vi.mock('@api/shared/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: vi.fn((value: string) => `decrypted:${value}`),
  },
}));

import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { GoogleSearchConsoleController } from '@api/services/integrations/google-search-console/controllers/google-search-console.controller';
import { GoogleSearchConsoleService } from '@api/services/integrations/google-search-console/services/google-search-console.service';
import { GoogleSearchConsoleOAuthService } from '@api/services/integrations/google-search-console/services/google-search-console-oauth.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('GoogleSearchConsoleController', () => {
  let controller: GoogleSearchConsoleController;
  let brandsService: { findOne: ReturnType<typeof vi.fn> };
  let credentialsService: {
    findOne: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    saveCredentials: ReturnType<typeof vi.fn>;
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
  const user = { id: 'auth-user-id' } as never;
  const brand = { _id: 'brand-id', organization: 'org-id', user: 'user-id' };
  const credential = {
    _id: 'credential-id',
    accessToken: 'encrypted-access-token',
    platform: 'google_search_console',
  };

  beforeEach(async () => {
    brandsService = {
      findOne: vi.fn().mockResolvedValue(brand),
    };
    credentialsService = {
      findOne: vi.fn().mockResolvedValue(credential),
      patch: vi.fn().mockResolvedValue({ ...credential, isConnected: true }),
      saveCredentials: vi.fn().mockResolvedValue(credential),
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
        _id: 'analytics-id',
        dimensions: ['query'],
        endDate: '2026-06-29',
        rows: [{ clicks: 2, impressions: 10, keys: ['genfeed'], position: 4 }],
        siteUrl: 'https://genfeed.ai/',
        startDate: '2026-06-01',
      }),
      listSites: vi.fn().mockResolvedValue([
        {
          _id: 'https://genfeed.ai/',
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
      brand: 'brand-id',
    });

    expect(brandsService.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'brand-id',
        organization: 'org-id',
      }),
    );
    expect(credentialsService.saveCredentials).toHaveBeenCalledWith(
      brand,
      'google_search_console',
      { isConnected: false },
    );
    expect(oauthService.generateAuthUrl).toHaveBeenCalledWith(
      expect.stringContaining('brand-id'),
    );
    expect(result).toEqual({
      url: 'https://accounts.google.com/o/oauth2/v2/auth',
    });
  });

  it('rejects connect when the brand is outside the organization', async () => {
    brandsService.findOne.mockResolvedValueOnce(null);

    await expect(
      controller.connect(request, user, { brand: 'brand-id' }),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('verifies OAuth and stores the primary Search Console property', async () => {
    const result = await controller.verify(request, {
      code: 'auth-code',
      state: JSON.stringify({ brandId: 'brand-id', organizationId: 'org-id' }),
    });

    expect(oauthService.exchangeAuthCodeForAccessToken).toHaveBeenCalledWith(
      'auth-code',
    );
    expect(gscService.listSites).toHaveBeenCalledWith('access-token');
    expect(credentialsService.patch).toHaveBeenCalledWith(
      'credential-id',
      expect.objectContaining({
        accessToken: 'access-token',
        externalHandle: 'https://genfeed.ai/',
        externalId: 'https://genfeed.ai/',
        isConnected: true,
        refreshToken: 'refresh-token',
      }),
    );
    expect(result).toEqual({ ...credential, isConnected: true });
  });

  it('throws when verify payload is missing OAuth parameters', async () => {
    await expect(
      controller.verify(request, { code: 'auth-code' }),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('throws BadRequestException when the account has no verified Search Console properties', async () => {
    gscService.listSites.mockResolvedValueOnce([]);

    await expect(
      controller.verify(request, {
        code: 'auth-code',
        state: JSON.stringify({
          brandId: 'brand-id',
          organizationId: 'org-id',
        }),
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
        _id: 'https://genfeed.ai/',
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
