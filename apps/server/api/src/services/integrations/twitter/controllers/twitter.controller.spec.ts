vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
}));

vi.mock('@api/shared/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: vi.fn((val: string) => val) },
}));

const mockGenerateOAuth2AuthLink = vi.fn();
const mockLoginWithOAuth2 = vi.fn();

vi.mock('twitter-api-v2', () => ({
  TwitterApi: vi.fn().mockImplementation(function () {
    return {
      generateOAuth2AuthLink: mockGenerateOAuth2AuthLink,
      loginWithOAuth2: mockLoginWithOAuth2,
    };
  }),
}));

import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TwitterController } from '@api/services/integrations/twitter/controllers/twitter.controller';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('TwitterController', () => {
  let controller: TwitterController;
  let brandsService: BrandsService;
  let credentialsService: CredentialsService;
  let twitterService: TwitterService;

  const mockBrandsService = {
    findOne: vi.fn(),
  };

  const mockCredentialsService = {
    findOne: vi.fn(),
    patch: vi.fn().mockResolvedValue({ _id: 'cred', isConnected: true }),
    saveCredentials: vi.fn(),
  };

  const mockTwitterService = {
    getAnalytics: vi.fn(),
    getTrends: vi.fn(),
    postTweet: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    mockGenerateOAuth2AuthLink.mockReturnValue({
      codeVerifier: 'test-code-verifier',
      state: 'test-state',
      url: 'https://twitter.com/i/oauth2/authorize?test',
    });
    mockLoginWithOAuth2.mockResolvedValue({
      accessToken: 'oauth2-access-token',
      client: {
        v2: {
          me: vi
            .fn()
            .mockResolvedValue({ data: { id: '1', username: 'testuser' } }),
        },
      },
      expiresIn: 7200,
      refreshToken: 'oauth2-refresh-token',
    });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TwitterController],
      providers: [
        { provide: ConfigService, useValue: { get: vi.fn(() => 'test-val') } },
        { provide: LoggerService, useValue: { error: vi.fn(), log: vi.fn() } },
        { provide: BrandsService, useValue: mockBrandsService },
        { provide: TwitterService, useValue: mockTwitterService },
        { provide: CredentialsService, useValue: mockCredentialsService },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TwitterController>(TwitterController);
    brandsService = module.get<BrandsService>(BrandsService);
    credentialsService = module.get<CredentialsService>(CredentialsService);
    twitterService = module.get<TwitterService>(TwitterService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('connect', () => {
    const brandId = 'test-object-id';
    const orgId = 'test-object-id';
    const mockUser = {
      publicMetadata: {
        organization: orgId.toString(),
        user: 'test-object-id',
      },
    };
    const mockRequest = {} as Request;

    it('should generate OAuth2 auth link and save code verifier', async () => {
      const brand = { _id: brandId, organization: orgId };
      mockBrandsService.findOne.mockResolvedValue(brand);
      mockCredentialsService.saveCredentials.mockResolvedValue({});

      const result = await controller.connect(
        mockRequest,
        mockUser as unknown as import('@clerk/backend').User,
        { brand: brandId },
      );

      expect(result.data).toHaveProperty('url');
      expect(result.data.url).toContain('twitter.com');
      expect(mockCredentialsService.saveCredentials).toHaveBeenCalledWith(
        brand,
        'twitter',
        expect.objectContaining({
          isConnected: false,
          oauthTokenSecret: 'test-code-verifier',
        }),
      );
    });

    it('should throw FORBIDDEN when brand not found', async () => {
      mockBrandsService.findOne.mockResolvedValue(null);

      await expect(
        controller.connect(
          mockRequest,
          mockUser as unknown as import('@clerk/backend').User,
          { brand: brandId },
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should throw INTERNAL_SERVER_ERROR when OAuth init fails', async () => {
      mockBrandsService.findOne.mockResolvedValue({
        _id: brandId,
        organization: orgId,
      });
      mockGenerateOAuth2AuthLink.mockImplementation(() => {
        throw new Error('OAuth init error');
      });

      await expect(
        controller.connect(
          mockRequest,
          mockUser as unknown as import('@clerk/backend').User,
          { brand: brandId },
        ),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('verify', () => {
    it('should exchange code and update credential with OAuth 2.0 PKCE', async () => {
      const brandId = '507f1f77bcf86cd799439011';
      const organizationId = '507f1f77bcf86cd799439012';
      const state = JSON.stringify({ brandId, organizationId });

      mockCredentialsService.findOne.mockResolvedValue({
        _id: 'cred',
        brand: brandId,
        oauthTokenSecret: 'encrypted-code-verifier',
        organization: organizationId,
      });

      const result = await controller.verify({} as Request, {
        code: 'auth-code',
        state,
      });

      expect(mockCredentialsService.findOne).toHaveBeenCalled();
      expect(mockCredentialsService.patch).toHaveBeenCalledWith(
        'cred',
        expect.objectContaining({
          accessToken: 'oauth2-access-token',
          externalHandle: 'testuser',
          externalId: '1',
          isConnected: true,
          refreshToken: 'oauth2-refresh-token',
        }),
      );
    });

    it('should throw BAD_REQUEST when code or state is missing', async () => {
      await expect(
        controller.verify({} as Request, { code: '', state: '' }),
      ).rejects.toThrow(HttpException);
    });

    it('should throw BAD_REQUEST when credential not found', async () => {
      const state = JSON.stringify({
        brandId: '507f1f77bcf86cd799439011',
        organizationId: '507f1f77bcf86cd799439012',
      });
      mockCredentialsService.findOne.mockResolvedValue(null);

      await expect(
        controller.verify({} as Request, { code: 'code', state }),
      ).rejects.toThrow(HttpException);
    });

    it('should throw BAD_REQUEST when code verifier is missing', async () => {
      const state = JSON.stringify({
        brandId: '507f1f77bcf86cd799439011',
        organizationId: '507f1f77bcf86cd799439012',
      });
      mockCredentialsService.findOne.mockResolvedValue({
        _id: 'cred',
        oauthTokenSecret: null,
      });

      await expect(
        controller.verify({} as Request, { code: 'code', state }),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('getTrends', () => {
    it('should return trends from twitterService', async () => {
      const trends = [{ name: '#AI', tweet_count: 1000 }];
      mockTwitterService.getTrends.mockResolvedValue(trends);

      const result = await controller.getTrends();

      expect(result).toEqual(trends);
      expect(mockTwitterService.getTrends).toHaveBeenCalled();
    });

    it('should throw INTERNAL_SERVER_ERROR when getTrends fails', async () => {
      mockTwitterService.getTrends.mockRejectedValue(
        new Error('API rate limited'),
      );

      await expect(controller.getTrends()).rejects.toThrow(HttpException);
    });
  });
});
