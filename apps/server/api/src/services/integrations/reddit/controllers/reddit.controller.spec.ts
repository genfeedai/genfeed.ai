vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnBadRequest: vi.fn((data: unknown) => data),
  returnNotFound: vi.fn((name: string, id: string) => ({ id, name })),
  serializeSingle: vi.fn(
    (_req: unknown, _serializer: unknown, data: unknown) => data,
  ),
}));

import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { RedditController } from '@api/services/integrations/reddit/controllers/reddit.controller';
import { RedditService } from '@api/services/integrations/reddit/services/reddit.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { of } from 'rxjs';

describe('RedditController', () => {
  let controller: RedditController;
  let brandsService: { findOne: ReturnType<typeof vi.fn> };
  let credentialsService: {
    beginOAuthForBrand: ReturnType<typeof vi.fn>;
    findPendingOAuthCredential: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    updateExternalProfile: ReturnType<typeof vi.fn>;
  };
  let redditService: { generateAuthUrl: ReturnType<typeof vi.fn> };
  let httpService: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
  };

  const mockRequest = {} as unknown as Request;
  const brandId = 'test-object-id';
  const orgId = '507f1f77bcf86cd799439011';
  const credentialId = 'test-object-id';
  const mockUser = {
    brandId,
    id: 'authProvider_user_1',
    organizationId: orgId,
    userId: '507f1f77bcf86cd799439013',
  } as never;

  // A real Prisma row: the scalar FK only. The Mongo-era `organization` alias
  // is undefined unless the query populated the relation, so a fixture that
  // carries it lies about the runtime shape.
  const mockBrand = {
    id: brandId,
    organizationId: orgId,
    userId: '507f1f77bcf86cd799439013',
  };

  beforeEach(async () => {
    brandsService = { findOne: vi.fn().mockResolvedValue(mockBrand) };
    credentialsService = {
      beginOAuthForBrand: vi.fn().mockResolvedValue({
        credential: { id: credentialId },
        state: 'opaque-oauth-state',
      }),
      findPendingOAuthCredential: vi.fn().mockResolvedValue({
        brandId,
        id: credentialId,
        organizationId: orgId,
        userId: '507f1f77bcf86cd799439013',
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
    redditService = {
      generateAuthUrl: vi
        .fn()
        .mockReturnValue('https://reddit.com/auth?state=xyz'),
    };
    httpService = {
      get: vi.fn(),
      post: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RedditController],
      providers: [
        {
          provide: ConfigService,
          useValue: { get: vi.fn().mockReturnValue('mock-value') },
        },
        { provide: LoggerService, useValue: { error: vi.fn(), log: vi.fn() } },
        { provide: BrandsService, useValue: brandsService },
        { provide: CredentialsService, useValue: credentialsService },
        { provide: RedditService, useValue: redditService },
        { provide: HttpService, useValue: httpService },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<RedditController>(RedditController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('connect', () => {
    const dto = { brandId: brandId.toString() };

    it('should return an OAuth URL for the pending credential', async () => {
      const result = await controller.connect(mockRequest, mockUser, dto);
      expect(result).toEqual({ url: 'https://reddit.com/auth?state=xyz' });
      expect(credentialsService.beginOAuthForBrand).toHaveBeenCalledWith(
        mockBrand,
        '507f1f77bcf86cd799439013',
        'reddit',
        { isConnected: false },
      );
      expect(redditService.generateAuthUrl).toHaveBeenCalledWith(
        'opaque-oauth-state',
      );
    });

    it('should throw FORBIDDEN when brand not found', async () => {
      brandsService.findOne.mockResolvedValueOnce(null);
      await expect(
        controller.connect(mockRequest, mockUser, dto),
      ).rejects.toThrow(HttpException);
    });

    it('should not expose tenant IDs in OAuth state', async () => {
      await controller.connect(mockRequest, mockUser, dto);
      const stateArg = redditService.generateAuthUrl.mock.calls[0][0] as string;
      expect(stateArg).toBe('opaque-oauth-state');
      expect(stateArg).not.toContain(brandId);
      expect(stateArg).not.toContain(orgId);
    });
  });

  describe('verify', () => {
    const state = 'opaque-oauth-state';
    const dto = { code: 'reddit_auth_code', state };

    beforeEach(() => {
      httpService.post.mockReturnValue(
        of({
          data: {
            access_token: 'at_reddit',
            expires_in: 3600,
            refresh_token: 'rt_reddit',
          },
        }),
      );
      httpService.get.mockReturnValue(
        of({
          data: {
            icon_img: 'https://reddit.example/avatar.png',
            id: 'reddit_user_id',
            name: 'reddit_username',
          },
        }),
      );
    });

    it('should exchange code for tokens and update credential', async () => {
      const result = await controller.verify(mockRequest, dto);
      expect(credentialsService.patch).toHaveBeenCalledWith(
        credentialId,
        expect.objectContaining({
          accessToken: 'at_reddit',
          isConnected: true,
          oauthState: null,
          refreshToken: 'rt_reddit',
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          externalHandle: 'reddit_username',
          externalId: 'reddit_user_id',
        }),
      );
      expect(credentialsService.updateExternalProfile).toHaveBeenCalledWith(
        credentialId,
        orgId,
        expect.objectContaining({
          avatarUrl: 'https://reddit.example/avatar.png',
          handle: 'reddit_username',
          id: 'reddit_user_id',
        }),
      );
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

    it('should set accessTokenExpiry from expires_in', async () => {
      await controller.verify(mockRequest, dto);
      const patchCall = credentialsService.patch.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(patchCall[1].accessTokenExpiry).toBeInstanceOf(Date);
    });

    it('should fetch Reddit profile after token exchange', async () => {
      await controller.verify(mockRequest, dto);
      expect(httpService.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/me'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer at_reddit',
          }),
        }),
      );
    });

    it('should propagate HTTP errors from token exchange', async () => {
      httpService.post.mockReturnValueOnce(
        of({ data: { error: 'invalid_grant' } }),
      );
      await expect(controller.verify(mockRequest, dto)).rejects.toThrow(
        HttpException,
      );
    });
  });
});
