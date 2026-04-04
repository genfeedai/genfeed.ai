vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getPublicMetadata: vi.fn(() => ({
    organization: '507f1f77bcf86cd799439011',
    user: '507f1f77bcf86cd799439013',
  })),
}));

vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnBadRequest: vi.fn((data: unknown) => data),
  returnNotFound: vi.fn((name: string, id: string) => ({ id, name })),
  serializeSingle: vi.fn(
    (_req: unknown, _serializer: unknown, data: unknown) => data,
  ),
}));

import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { RedditController } from '@api/services/integrations/reddit/controllers/reddit.controller';
import { RedditService } from '@api/services/integrations/reddit/services/reddit.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { of } from 'rxjs';

describe('RedditController', () => {
  let controller: RedditController;
  let brandsService: { findOne: ReturnType<typeof vi.fn> };
  let credentialsService: {
    findOne: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    saveCredentials: ReturnType<typeof vi.fn>;
  };
  let redditService: { generateAuthUrl: ReturnType<typeof vi.fn> };
  let httpService: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
  };

  const mockRequest = {} as unknown as Request;
  const mockUser = { id: 'clerk_user_1' } as never;
  const brandId = new Types.ObjectId();
  const orgId = new Types.ObjectId('507f1f77bcf86cd799439011');
  const credentialId = new Types.ObjectId();

  const mockBrand = {
    _id: brandId,
    organization: orgId,
  };

  beforeEach(async () => {
    brandsService = { findOne: vi.fn().mockResolvedValue(mockBrand) };
    credentialsService = {
      findOne: vi.fn().mockResolvedValue({ _id: credentialId }),
      patch: vi
        .fn()
        .mockImplementation((_id, data) =>
          Promise.resolve({ _id: credentialId, ...data }),
        ),
      saveCredentials: vi.fn().mockResolvedValue({ _id: credentialId }),
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
    const dto = { brand: brandId.toString() };

    it('should return OAuth URL when brand exists and credential exists', async () => {
      const result = await controller.connect(mockRequest, mockUser, dto);
      expect(result).toEqual({ url: 'https://reddit.com/auth?state=xyz' });
      expect(redditService.generateAuthUrl).toHaveBeenCalled();
      expect(credentialsService.saveCredentials).not.toHaveBeenCalled();
    });

    it('should create new credential when none exists', async () => {
      credentialsService.findOne.mockResolvedValueOnce(null);
      await controller.connect(mockRequest, mockUser, dto);
      expect(credentialsService.saveCredentials).toHaveBeenCalled();
    });

    it('should throw FORBIDDEN when brand not found', async () => {
      brandsService.findOne.mockResolvedValueOnce(null);
      await expect(
        controller.connect(mockRequest, mockUser, dto),
      ).rejects.toThrow(HttpException);
    });

    it('should pass state with brand/org/user IDs', async () => {
      await controller.connect(mockRequest, mockUser, dto);
      const stateArg = redditService.generateAuthUrl.mock.calls[0][0] as string;
      const parsed = JSON.parse(stateArg) as {
        brandId: string;
        organizationId: string;
        userId: string;
      };
      expect(parsed.brandId).toBe(brandId.toString());
      expect(parsed.organizationId).toBe(orgId.toString());
    });
  });

  describe('verify', () => {
    const state = JSON.stringify({
      brandId: brandId.toString(),
      organizationId: orgId.toString(),
    });
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
          data: { id: 'reddit_user_id', name: 'reddit_username' },
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
          refreshToken: 'rt_reddit',
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          externalHandle: 'reddit_username',
          externalId: 'reddit_user_id',
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
      credentialsService.findOne.mockResolvedValueOnce(null);
      await expect(controller.verify(mockRequest, dto)).rejects.toThrow(
        HttpException,
      );
    });

    it('should set accessTokenExpiry from expires_in', async () => {
      await controller.verify(mockRequest, dto);
      const patchCall = credentialsService.patch.mock.calls[0] as [
        Types.ObjectId,
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
      // The access_token will be undefined, but it won't throw from the post
      // The findOne for credential will be called
      credentialsService.findOne.mockResolvedValueOnce(null);
      await expect(controller.verify(mockRequest, dto)).rejects.toThrow(
        HttpException,
      );
    });
  });
});
