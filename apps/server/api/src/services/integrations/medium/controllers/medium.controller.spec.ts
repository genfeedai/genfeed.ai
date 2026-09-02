vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnBadRequest: vi.fn((payload: Record<string, string>) => ({
    errors: [payload],
  })),
  returnInternalServerError: vi.fn((detail: string) => ({
    errors: [{ detail }],
  })),
  returnNotFound: vi.fn((type: string, id: string) => ({
    errors: [{ detail: `${type} ${id} not found` }],
  })),
  serializeSingle: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => ({ data }),
  ),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { MediumController } from '@api/services/integrations/medium/controllers/medium.controller';
import { MediumService } from '@api/services/integrations/medium/services/medium.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('MediumController', () => {
  let controller: MediumController;

  const brandId = 'brand-id';
  const organizationId = 'organization-id';
  const userId = 'user-id';
  const request = {} as Request;
  const user = {
    brandId: brandId,
    organizationId: organizationId,
    userId: userId,
  } as unknown as User;

  const brandsService = {
    findOne: vi.fn(),
  };
  const credentialsService = {
    beginOAuthForBrand: vi.fn(),
    connectAccount: vi.fn(),
    findPendingOAuthCredential: vi.fn(),
    patch: vi.fn(),
  };
  const mediumService = {
    exchangeAuthCodeForAccessToken: vi.fn(),
    generateAuthUrl: vi.fn(),
    getUserProfile: vi.fn(),
    publishArticle: vi.fn(),
  };
  const loggerService = {
    error: vi.fn(),
    log: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MediumController],
      providers: [
        { provide: BrandsService, useValue: brandsService },
        { provide: CredentialsService, useValue: credentialsService },
        { provide: MediumService, useValue: mediumService },
        { provide: LoggerService, useValue: loggerService },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(MediumController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('connect', () => {
    it('stores an opaque state against the authenticated brand', async () => {
      const brand = { id: brandId, organizationId, userId };
      brandsService.findOne.mockResolvedValue(brand);
      credentialsService.beginOAuthForBrand.mockResolvedValue({
        credential: { id: 'credential-id' },
        state: 'opaque-oauth-state',
      });
      mediumService.generateAuthUrl.mockReturnValue(
        'https://medium.com/m/oauth/authorize?state=opaque-oauth-state',
      );

      const result = await controller.connect(request, user, { brandId });

      expect(brandsService.findOne).toHaveBeenCalledWith({
        id: brandId,
        organizationId,
      });
      expect(credentialsService.beginOAuthForBrand).toHaveBeenCalledWith(
        brand,
        userId,
        CredentialPlatform.MEDIUM,
        { isConnected: false },
      );
      expect(mediumService.generateAuthUrl).toHaveBeenCalledWith(
        'opaque-oauth-state',
      );
      expect(result).toEqual({
        data: {
          url: 'https://medium.com/m/oauth/authorize?state=opaque-oauth-state',
        },
      });
    });

    it('rejects a brand outside the authenticated organization', async () => {
      brandsService.findOne.mockResolvedValue(null);

      const result = await controller.connect(request, user, { brandId });

      expect(result).toHaveProperty('errors');
      expect(credentialsService.beginOAuthForBrand).not.toHaveBeenCalled();
    });
  });

  describe('verify', () => {
    it('resolves ownership from state and persists canonical token fields', async () => {
      credentialsService.findPendingOAuthCredential.mockResolvedValue({
        brandId,
        id: 'credential-id',
        organizationId,
        userId,
      });
      mediumService.exchangeAuthCodeForAccessToken.mockResolvedValue({
        accessToken: 'medium-access-token',
        expiresIn: 3600,
        refreshToken: 'medium-refresh-token',
      });
      mediumService.getUserProfile.mockResolvedValue({
        id: 'medium-profile-id',
        username: 'publisher',
      });
      credentialsService.connectAccount.mockResolvedValue({
        id: 'credential-id',
        isConnected: true,
      });

      const beforeExchange = Date.now();
      const result = await controller.verify(request, {
        code: 'authorization-code',
        state: 'opaque-oauth-state',
      });

      expect(
        credentialsService.findPendingOAuthCredential,
      ).toHaveBeenCalledWith('opaque-oauth-state', CredentialPlatform.MEDIUM);
      expect(credentialsService.connectAccount).toHaveBeenCalledWith(
        'credential-id',
        organizationId,
        expect.objectContaining({
          handle: 'publisher',
          id: 'medium-profile-id',
        }),
        expect.objectContaining({
          accessToken: 'medium-access-token',
          refreshToken: 'medium-refresh-token',
        }),
      );
      const update = credentialsService.connectAccount.mock.calls[0]?.[3] as {
        accessTokenExpiry?: Date;
      };
      expect(update.accessTokenExpiry?.getTime()).toBeGreaterThanOrEqual(
        beforeExchange + 3_600_000,
      );
      expect(result).toEqual({
        data: { id: 'credential-id', isConnected: true },
      });
    });

    it('rejects missing callback parameters before querying credentials', async () => {
      const result = await controller.verify(request, {});

      expect(result).toHaveProperty('errors');
      expect(
        credentialsService.findPendingOAuthCredential,
      ).not.toHaveBeenCalled();
    });

    it('rejects an unknown or expired OAuth state', async () => {
      credentialsService.findPendingOAuthCredential.mockResolvedValue(null);

      const result = await controller.verify(request, {
        code: 'authorization-code',
        state: 'expired-state',
      });

      expect(result).toHaveProperty('errors');
      expect(
        mediumService.exchangeAuthCodeForAccessToken,
      ).not.toHaveBeenCalled();
    });

    it('rethrows intentional HTTP failures', async () => {
      credentialsService.findPendingOAuthCredential.mockRejectedValue(
        new HttpException('Forbidden', 403),
      );

      await expect(
        controller.verify(request, {
          code: 'authorization-code',
          state: 'opaque-oauth-state',
        }),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('publishArticle', () => {
    it('passes authenticated organization ownership to the service', async () => {
      mediumService.publishArticle.mockResolvedValue({ id: 'medium-post-id' });

      const result = await controller.publishArticle(
        user,
        'article-id',
        brandId,
        'draft',
        undefined,
      );

      expect(mediumService.publishArticle).toHaveBeenCalledWith(
        'article-id',
        organizationId,
        brandId,
        'draft',
        undefined,
      );
      expect(result).toEqual({
        data: { id: 'medium-post-id' },
        success: true,
      });
    });
  });
});
