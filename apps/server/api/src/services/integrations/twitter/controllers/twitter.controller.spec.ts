vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
}));

vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: vi.fn((val: string) => val) },
}));

const mockGenerateOAuth2AuthLink = vi.fn();
const mockLoginWithOAuth2 = vi.fn();

vi.mock('twitter-api-v2', () => ({
  TwitterApi: vi.fn(function TwitterApiMock() {
    return {
      generateOAuth2AuthLink: mockGenerateOAuth2AuthLink,
      loginWithOAuth2: mockLoginWithOAuth2,
    };
  }),
}));

import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TwitterController } from '@api/services/integrations/twitter/controllers/twitter.controller';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { TwitterAuthorizedSignalsService } from '@api/services/integrations/twitter/services/twitter-authorized-signals.service';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('TwitterController', () => {
  let controller: TwitterController;
  const mockConfigGet = vi.fn((_key?: string) => 'test-val');

  const mockBrandsService = {
    findOne: vi.fn(),
  };

  const mockCredentialsService = {
    beginOAuthForBrand: vi.fn().mockResolvedValue({
      credential: { id: 'cred' },
      state: 'opaque-oauth-state',
    }),
    findOne: vi.fn().mockResolvedValue({ id: 'cred', isConnected: true }),
    findPendingOAuthCredential: vi.fn(),
    patch: vi.fn().mockResolvedValue({ id: 'cred', isConnected: true }),
    updateExternalProfile: vi
      .fn()
      .mockResolvedValue({ id: 'cred', isConnected: true }),
  };

  const mockTwitterService = {
    getAnalytics: vi.fn(),
    getTrends: vi.fn(),
    postTweet: vi.fn(),
  };

  const mockTwitterAuthorizedSignalsService = {
    refresh: vi.fn().mockResolvedValue({ state: 'full' }),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockConfigGet.mockImplementation((_key?: string) => 'test-val');

    mockGenerateOAuth2AuthLink.mockReturnValue({
      codeVerifier: 'test-code-verifier',
      state: 'test-state',
      url: 'https://twitter.com/i/oauth2/authorize?test',
    });
    mockLoginWithOAuth2.mockResolvedValue({
      accessToken: 'oauth2-access-token',
      client: {
        v2: {
          me: vi.fn().mockResolvedValue({
            data: {
              id: '1',
              name: 'Test User',
              profile_image_url: 'https://twitter.example/avatar.jpg',
              username: 'testuser',
            },
          }),
        },
      },
      expiresIn: 7200,
      refreshToken: 'oauth2-refresh-token',
      scope: 'tweet.read tweet.write users.read',
    });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TwitterController],
      providers: [
        { provide: ConfigService, useValue: { get: mockConfigGet } },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
        { provide: BrandsService, useValue: mockBrandsService },
        { provide: TwitterService, useValue: mockTwitterService },
        {
          provide: TwitterAuthorizedSignalsService,
          useValue: mockTwitterAuthorizedSignalsService,
        },
        { provide: CredentialsService, useValue: mockCredentialsService },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TwitterController>(TwitterController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('connect', () => {
    const brandId = 'test-object-id';
    const orgId = 'test-object-id';
    const mockUser = {
      organizationId: orgId.toString(),
      userId: 'test-object-id',
    };
    const mockRequest = {} as Request;

    it('should generate OAuth2 auth link and save code verifier', async () => {
      const brand = {
        id: brandId,
        organizationId: orgId,
        userId: 'test-object-id',
      };
      mockBrandsService.findOne.mockResolvedValue(brand);

      const result = await controller.connect(
        mockRequest,
        mockUser as unknown as import('@api/auth/interfaces/authenticated-user.interface').AuthenticatedUser,
        { brandId },
      );

      expect(result.data).toHaveProperty('url');
      expect(result.data.url).toContain('twitter.com');
      expect(mockCredentialsService.beginOAuthForBrand).toHaveBeenCalledWith(
        brand,
        'test-object-id',
        'twitter',
        { isConnected: false },
      );
      expect(mockGenerateOAuth2AuthLink).toHaveBeenCalledWith('test-val', {
        scope: [
          'tweet.read',
          'tweet.write',
          'users.read',
          'media.write',
          'offline.access',
        ],
        state: 'opaque-oauth-state',
      });
      expect(mockCredentialsService.patch).toHaveBeenCalledWith('cred', {
        oauthTokenSecret: 'test-code-verifier',
      });
    });

    it('refuses to start OAuth when the Twitter client id is a placeholder', async () => {
      mockBrandsService.findOne.mockResolvedValue({
        id: brandId,
        organizationId: orgId,
        userId: 'test-object-id',
      });
      mockConfigGet.mockImplementation((key?: string) =>
        key === 'TWITTER_CLIENT_ID' ? 'PLACEHOLDER_NOT_CONFIGURED' : 'test-val',
      );

      await expect(
        controller.connect(
          mockRequest,
          mockUser as unknown as import('@api/auth/interfaces/authenticated-user.interface').AuthenticatedUser,
          { brandId },
        ),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(mockGenerateOAuth2AuthLink).not.toHaveBeenCalled();
      expect(mockCredentialsService.beginOAuthForBrand).not.toHaveBeenCalled();
    });

    it('should throw FORBIDDEN when brand not found', async () => {
      mockBrandsService.findOne.mockResolvedValue(null);

      await expect(
        controller.connect(
          mockRequest,
          mockUser as unknown as import('@api/auth/interfaces/authenticated-user.interface').AuthenticatedUser,
          { brandId },
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should throw INTERNAL_SERVER_ERROR when OAuth init fails', async () => {
      mockBrandsService.findOne.mockResolvedValue({
        id: brandId,
        organizationId: orgId,
        userId: 'test-object-id',
      });
      mockGenerateOAuth2AuthLink.mockImplementation(() => {
        throw new Error('OAuth init error');
      });

      await expect(
        controller.connect(
          mockRequest,
          mockUser as unknown as import('@api/auth/interfaces/authenticated-user.interface').AuthenticatedUser,
          { brandId },
        ),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('verify', () => {
    it('should exchange code and update credential with OAuth 2.0 PKCE', async () => {
      const brandId = testId('brand');
      const organizationId = testId('org');
      const state = 'opaque-oauth-state';

      mockCredentialsService.findPendingOAuthCredential.mockResolvedValue({
        brandId,
        id: 'cred',
        oauthTokenSecret: 'encrypted-code-verifier',
        organizationId,
      });

      await controller.verify({} as Request, {
        code: 'auth-code',
        state,
      });

      expect(
        mockCredentialsService.findPendingOAuthCredential,
      ).toHaveBeenCalledWith('opaque-oauth-state', 'twitter');
      expect(mockCredentialsService.patch).toHaveBeenCalledWith(
        'cred',
        expect.objectContaining({
          accessToken: 'oauth2-access-token',
          isConnected: true,
          oauthState: null,
          oauthToken: null,
          oauthTokenSecret: null,
          refreshToken: 'oauth2-refresh-token',
          grantedScopes: ['tweet.read', 'tweet.write', 'users.read'],
          grantedScopesCapturedAt: expect.any(Date),
        }),
      );
      expect(mockCredentialsService.updateExternalProfile).toHaveBeenCalledWith(
        'cred',
        organizationId,
        {
          avatarUrl: 'https://twitter.example/avatar.jpg',
          handle: 'testuser',
          id: '1',
          name: 'Test User',
        },
      );
      expect(mockTwitterAuthorizedSignalsService.refresh).toHaveBeenCalledWith({
        accessToken: 'oauth2-access-token',
        credentialId: 'cred',
        force: true,
        grantedScopes: 'tweet.read tweet.write users.read',
        organizationId,
      });
    });

    it('still returns the credential when authorized signal refresh fails', async () => {
      mockCredentialsService.findPendingOAuthCredential.mockResolvedValue({
        brandId: testId('brand'),
        id: 'cred',
        oauthTokenSecret: 'encrypted-code-verifier',
        organizationId: testId('org'),
      });
      mockTwitterAuthorizedSignalsService.refresh.mockRejectedValueOnce(
        new Error('X rate limited'),
      );

      const result = await controller.verify({} as Request, {
        code: 'auth-code',
        state: 'opaque-oauth-state',
      });

      expect(result.data).toEqual({ id: 'cred', isConnected: true });
    });

    it('should throw BAD_REQUEST when code or state is missing', async () => {
      await expect(
        controller.verify({} as Request, { code: '', state: '' }),
      ).rejects.toThrow(HttpException);
    });

    it('should throw BAD_REQUEST when credential not found', async () => {
      const state = 'foreign-or-expired-state';
      mockCredentialsService.findPendingOAuthCredential.mockResolvedValue(null);

      await expect(
        controller.verify({} as Request, { code: 'code', state }),
      ).rejects.toThrow(HttpException);
    });

    it('should throw BAD_REQUEST when code verifier is missing', async () => {
      const state = 'opaque-oauth-state';
      mockCredentialsService.findPendingOAuthCredential.mockResolvedValue({
        id: 'cred',
        oauthTokenSecret: null,
      });

      await expect(
        controller.verify({} as Request, { code: 'code', state }),
      ).rejects.toThrow(HttpException);
    });

    it('returns BAD_REQUEST when X rejects an expired authorization code', async () => {
      mockCredentialsService.findPendingOAuthCredential.mockResolvedValue({
        id: 'cred',
        oauthTokenSecret: 'encrypted-code-verifier',
        organizationId: testId('org'),
      });
      mockLoginWithOAuth2.mockRejectedValue({
        data: {
          error: 'invalid_grant',
          error_description: 'The authorization code has expired',
        },
      });

      const failure = await controller
        .verify({} as Request, {
          code: 'expired-code',
          state: 'opaque-oauth-state',
        })
        .then(
          () => null,
          (error: unknown) => error,
        );

      expect(failure).toBeInstanceOf(HttpException);
      expect((failure as HttpException).getStatus()).toBe(
        HttpStatus.BAD_REQUEST,
      );
      expect((failure as HttpException).getResponse()).toMatchObject({
        detail: 'X authorization expired or was already used. Connect X again.',
      });
    });

    it('keeps invalid X client credentials as a server failure', async () => {
      mockCredentialsService.findPendingOAuthCredential.mockResolvedValue({
        id: 'cred',
        oauthTokenSecret: 'encrypted-code-verifier',
        organizationId: testId('org'),
      });
      const providerFailure = {
        response: {
          data: {
            error: 'invalid_client',
            error_description: 'Client authentication failed',
          },
          status: 401,
        },
      };
      mockLoginWithOAuth2.mockRejectedValue(providerFailure);

      await expect(
        controller.verify({} as Request, {
          code: 'auth-code',
          state: 'opaque-oauth-state',
        }),
      ).rejects.toBe(providerFailure);
    });
  });

  describe('refreshAuthorizedSignals', () => {
    const mockUser = {
      organizationId: 'org-1',
      userId: 'user-1',
    };
    const mockRequest = {} as Request;

    it('returns the documented 404 when the credential is missing or cross-org', async () => {
      mockTwitterAuthorizedSignalsService.refresh.mockRejectedValueOnce(
        new NotFoundException('X credential'),
      );

      const failure = await controller
        .refreshAuthorizedSignals(mockRequest, mockUser as never, 'missing')
        .then(
          () => null,
          (error: unknown) => error,
        );

      expect(failure).toBeInstanceOf(HttpException);
      expect((failure as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(mockCredentialsService.findOne).not.toHaveBeenCalled();
    });

    it('refreshes and returns only the caller organization credential', async () => {
      mockCredentialsService.findOne.mockResolvedValueOnce({
        id: 'cred',
        organizationId: 'org-1',
      });

      const result = await controller.refreshAuthorizedSignals(
        mockRequest,
        mockUser as never,
        'cred',
      );

      expect(mockTwitterAuthorizedSignalsService.refresh).toHaveBeenCalledWith({
        credentialId: 'cred',
        organizationId: 'org-1',
      });
      expect(mockCredentialsService.findOne).toHaveBeenCalledWith({
        id: 'cred',
        organizationId: 'org-1',
        platform: 'TWITTER',
      });
      expect(result.data).toEqual({ id: 'cred', organizationId: 'org-1' });
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
