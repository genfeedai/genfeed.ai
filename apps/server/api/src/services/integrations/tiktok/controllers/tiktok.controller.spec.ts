vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn(
    (_req: unknown, _serializer: unknown, data: unknown) => data,
  ),
}));

import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TiktokController } from '@api/services/integrations/tiktok/controllers/tiktok.controller';
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import { TiktokAuthorizedSignalsService } from '@api/services/integrations/tiktok/services/tiktok-authorized-signals.service';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { of } from 'rxjs';

describe('TiktokController', () => {
  let controller: TiktokController;
  let brandsService: { findOne: ReturnType<typeof vi.fn> };
  let credentialsService: {
    beginOAuthForBrand: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    findPendingOAuthCredential: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    updateExternalProfile: ReturnType<typeof vi.fn>;
  };
  let tiktokService: {
    getTiktokInfo: ReturnType<typeof vi.fn>;
    getTrends: ReturnType<typeof vi.fn>;
  };
  let tiktokAuthorizedSignalsService: {
    refresh: ReturnType<typeof vi.fn>;
  };
  let httpService: { post: ReturnType<typeof vi.fn> };

  const mockRequest = {} as unknown as Request;
  const brandId = 'test-object-id';
  const orgId = testId('org');
  const credentialId = 'test-object-id';
  const userId = testId('user');
  const mockUser = {
    brandId,
    id: 'authProvider_user_1',
    organizationId: orgId,
    userId,
  } as never;

  // A real Prisma row carries the scalar FK, never the populated-only alias.
  const mockBrand = {
    id: brandId,
    organizationId: orgId,
    userId,
  };

  beforeEach(async () => {
    brandsService = { findOne: vi.fn().mockResolvedValue(mockBrand) };
    credentialsService = {
      beginOAuthForBrand: vi.fn().mockResolvedValue({
        credential: { id: credentialId },
        state: 'opaque-oauth-state',
      }),
      findOne: vi.fn().mockResolvedValue({
        externalAvatar: 'https://tiktok.example/avatar.jpg',
        externalHandle: 'tiktok_handle',
        externalId: 'tiktok_ext_id',
        externalName: 'TikTok Creator',
        id: credentialId,
        organizationId: orgId,
        platform: 'tiktok',
      }),
      findPendingOAuthCredential: vi.fn().mockResolvedValue({
        brandId,
        id: credentialId,
        organizationId: orgId,
        userId,
      }),
      patch: vi
        .fn()
        .mockImplementation((_credentialId, data) =>
          Promise.resolve({ id: credentialId, ...data }),
        ),
      updateExternalProfile: vi
        .fn()
        .mockImplementation((_credentialId, _organizationId, data) =>
          Promise.resolve({
            externalAvatar: data.avatarUrl,
            externalHandle: data.handle,
            externalId: data.id,
            externalName: data.name,
            id: credentialId,
          }),
        ),
    };
    tiktokService = {
      getTiktokInfo: vi.fn().mockResolvedValue({
        avatarUrl: 'https://tiktok.example/avatar.jpg',
        displayName: 'TikTok Creator',
        userId: 'tiktok_ext_id',
        username: 'tiktok_handle',
      }),
      getTrends: vi.fn().mockResolvedValue([{ title: 'trend1' }]),
    };
    tiktokAuthorizedSignalsService = {
      refresh: vi.fn().mockResolvedValue({ state: 'full' }),
    };
    httpService = { post: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TiktokController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockImplementation((key: string) => {
              if (key === 'GENFEEDAI_APP_URL') return 'https://app.genfeed.ai';
              return 'mock-value';
            }),
          },
        },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
        { provide: BrandsService, useValue: brandsService },
        { provide: CredentialsService, useValue: credentialsService },
        { provide: TiktokService, useValue: tiktokService },
        {
          provide: TiktokAuthorizedSignalsService,
          useValue: tiktokAuthorizedSignalsService,
        },
        { provide: HttpService, useValue: httpService },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TiktokController>(TiktokController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('connect', () => {
    const dto = { brandId: brandId.toString() };

    it('should return TikTok OAuth URL', async () => {
      const result = await controller.connect(mockRequest, mockUser, dto);
      expect(result).toEqual({
        url: expect.stringContaining('tiktok.com/v2/auth/authorize'),
      });
    });

    it('should save unconnected credential', async () => {
      await controller.connect(mockRequest, mockUser, dto);
      expect(credentialsService.beginOAuthForBrand).toHaveBeenCalledWith(
        mockBrand,
        userId,
        'tiktok',
        expect.objectContaining({ isConnected: false }),
      );
    });

    it('should throw FORBIDDEN when brand not found', async () => {
      brandsService.findOne.mockResolvedValueOnce(null);
      await expect(
        controller.connect(mockRequest, mockUser, dto),
      ).rejects.toThrow(HttpException);
    });

    it('should include only the opaque server-issued state in the URL', async () => {
      const result = (await controller.connect(mockRequest, mockUser, dto)) as {
        url: string;
      };
      const url = new URL(result.url);
      const stateParam = url.searchParams.get('state');
      expect(stateParam).toBe('opaque-oauth-state');
      expect(result.url).not.toContain(brandId);
      expect(result.url).not.toContain(orgId);
    });
  });

  describe('verify', () => {
    const state = 'opaque-oauth-state';
    const dto = { code: 'tiktok_code_123', state };

    beforeEach(() => {
      httpService.post.mockReturnValue(
        of({
          data: {
            access_token: 'tt_access',
            expires_in: 86400,
            refresh_expires_in: 2592000,
            refresh_token: 'tt_refresh',
            scope:
              'user.info.basic,user.info.profile,user.info.stats,video.list,video.publish',
          },
        }),
      );
    });

    it('should exchange code and update credential with tokens', async () => {
      await controller.verify(mockRequest, dto);
      expect(credentialsService.patch).toHaveBeenCalledWith(
        credentialId,
        expect.objectContaining({
          accessToken: 'tt_access',
          isConnected: true,
          isDeleted: false,
          oauthState: null,
          refreshToken: 'tt_refresh',
          grantedScopes: [
            'user.info.basic',
            'user.info.profile',
            'user.info.stats',
            'video.list',
            'video.publish',
          ],
          grantedScopesCapturedAt: expect.any(Date),
        }),
      );
    });

    it('should fetch TikTok user info and set external handle', async () => {
      const result = await controller.verify(mockRequest, dto);
      expect(tiktokService.getTiktokInfo).toHaveBeenCalledWith(
        orgId.toString(),
        brandId.toString(),
        'tt_access',
        'user.info.basic,user.info.profile,user.info.stats,video.list,video.publish',
      );
      expect(result).toEqual(
        expect.objectContaining({
          externalHandle: 'tiktok_handle',
          externalId: 'tiktok_ext_id',
        }),
      );
      expect(credentialsService.updateExternalProfile).toHaveBeenCalledWith(
        credentialId,
        orgId,
        expect.objectContaining({
          avatarUrl: 'https://tiktok.example/avatar.jpg',
          handle: 'tiktok_handle',
          id: 'tiktok_ext_id',
          name: 'TikTok Creator',
        }),
      );
    });

    it('refreshes authorized evidence with the exact granted scopes', async () => {
      await controller.verify(mockRequest, dto);

      expect(tiktokAuthorizedSignalsService.refresh).toHaveBeenCalledWith({
        accessToken: 'tt_access',
        credentialId,
        force: true,
        grantedScopes:
          'user.info.basic,user.info.profile,user.info.stats,video.list,video.publish',
        organizationId: orgId,
      });
    });

    it('should throw BAD_REQUEST when code is missing', async () => {
      await expect(controller.verify(mockRequest, { state })).rejects.toThrow(
        HttpException,
      );
    });

    it('should throw BAD_REQUEST when state is missing', async () => {
      await expect(
        controller.verify(mockRequest, { code: 'abc' }),
      ).rejects.toThrow(HttpException);
    });

    it('should throw NOT_FOUND when no pending credential found', async () => {
      credentialsService.findPendingOAuthCredential.mockResolvedValueOnce(null);
      await expect(controller.verify(mockRequest, dto)).rejects.toThrow(
        HttpException,
      );
    });

    it('should set token expiry dates', async () => {
      await controller.verify(mockRequest, dto);
      const patchCall = credentialsService.patch.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(patchCall[1].accessTokenExpiry).toBeInstanceOf(Date);
      expect(patchCall[1].refreshTokenExpiry).toBeInstanceOf(Date);
    });

    it('should reactivate previously deleted credential', async () => {
      await controller.verify(mockRequest, dto);
      const patchCall = credentialsService.patch.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(patchCall[1].isDeleted).toBe(false);
    });
  });

  describe('refreshAuthorizedSignals', () => {
    it('returns the documented 404 when the credential is missing or cross-org', async () => {
      tiktokAuthorizedSignalsService.refresh.mockRejectedValueOnce(
        new NotFoundException('TikTok credential'),
      );

      const failure = await controller
        .refreshAuthorizedSignals(mockRequest, mockUser, 'missing-credential')
        .then(
          () => null,
          (error: unknown) => error,
        );

      expect(failure).toBeInstanceOf(HttpException);
      expect((failure as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(credentialsService.findOne).not.toHaveBeenCalled();
    });

    it('refreshes and returns only the caller organization credential', async () => {
      const result = await controller.refreshAuthorizedSignals(
        mockRequest,
        mockUser,
        credentialId,
      );

      expect(tiktokAuthorizedSignalsService.refresh).toHaveBeenCalledWith({
        credentialId,
        organizationId: orgId,
      });
      expect(credentialsService.findOne).toHaveBeenCalledWith({
        id: credentialId,
        organizationId: orgId,
        platform: 'tiktok',
      });
      expect(result).toEqual(expect.objectContaining({ id: credentialId }));
    });
  });

  describe('getTrends', () => {
    it('should return trends from TikTok service', async () => {
      const result = await controller.getTrends();
      expect(result).toEqual([{ title: 'trend1' }]);
    });

    it('should throw INTERNAL_SERVER_ERROR when service fails', () => {
      tiktokService.getTrends.mockImplementation(() => {
        throw new Error('API failed');
      });
      expect(() => controller.getTrends()).toThrow(HttpException);
    });
  });
});
