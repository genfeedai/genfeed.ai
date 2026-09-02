vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn(
    (_req: unknown, _serializer: unknown, data: unknown) => data,
  ),
}));

vi.mock('@api/shared/utils/youtube-oauth/youtube-oauth.util', () => ({
  YoutubeOAuth2Util: {
    createClient: vi.fn(() => ({
      setCredentials: vi.fn(),
    })),
  },
}));

import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { YoutubeController } from '@api/services/integrations/youtube/controllers/youtube.controller';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { YoutubeAuthorizedSignalsService } from '@api/services/integrations/youtube/services/youtube-authorized-signals.service';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

interface YoutubeControllerBrandsServiceMock {
  findOne: ReturnType<typeof vi.fn>;
}

interface YoutubeControllerCredentialsServiceMock {
  beginOAuthForBrand: ReturnType<typeof vi.fn>;
  findOne: ReturnType<typeof vi.fn>;
  findPendingOAuthCredential: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  updateExternalProfile: ReturnType<typeof vi.fn>;
}

interface YoutubeServiceMock {
  exchangeCodeForTokens: ReturnType<typeof vi.fn>;
  generateAuthUrl: ReturnType<typeof vi.fn>;
  getChannelDetails: ReturnType<typeof vi.fn>;
  getTrends: ReturnType<typeof vi.fn>;
  getVideoMetadata: ReturnType<typeof vi.fn>;
}

interface YoutubeAuthorizedSignalsServiceMock {
  refresh: ReturnType<typeof vi.fn>;
}

describe('YoutubeController', () => {
  let controller: YoutubeController;
  let brandsService: YoutubeControllerBrandsServiceMock;
  let credentialsService: YoutubeControllerCredentialsServiceMock;
  let youtubeService: YoutubeServiceMock;
  let youtubeAuthorizedSignalsService: YoutubeAuthorizedSignalsServiceMock;

  const mockRequest = {} as unknown as Request;
  const brandId = 'test-object-id';
  const orgId = testId('org');
  const userId = testId('user');
  const credentialId = 'test-object-id';
  const mockUser = {
    brandId,
    id: 'authProvider_user_1',
    organizationId: orgId,
    userId,
  } as never;

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
      findOne: vi
        .fn()
        .mockResolvedValue({ id: credentialId, refreshToken: 'rt_saved' }),
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
    youtubeService = {
      exchangeCodeForTokens: vi.fn().mockResolvedValue({
        tokens: {
          access_token: 'yt_access',
          expiry_date: Date.now() + 3600000,
          refresh_token: 'yt_refresh',
          scope: 'youtube',
          token_type: 'Bearer',
        },
      }),
      generateAuthUrl: vi
        .fn()
        .mockReturnValue(
          'https://accounts.google.com/o/oauth2/v2/auth?scope=youtube',
        ),
      getChannelDetails: vi.fn().mockResolvedValue({
        customUrl: '@mychannel',
        id: 'UCxxxxxx',
        thumbnails: {
          high: { url: 'https://youtube.example/avatar.jpg' },
        },
        title: 'My Channel',
      }),
      getTrends: vi.fn().mockResolvedValue([{ title: 'trending video' }]),
      getVideoMetadata: vi.fn().mockResolvedValue({
        description: 'A video',
        title: 'Test Video',
        viewCount: '1000',
      }),
    };
    youtubeAuthorizedSignalsService = {
      refresh: vi.fn().mockResolvedValue({ state: 'full' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [YoutubeController],
      providers: [
        {
          provide: ConfigService,
          useValue: { get: vi.fn().mockReturnValue('mock-value') },
        },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
        { provide: BrandsService, useValue: brandsService },
        { provide: CredentialsService, useValue: credentialsService },
        { provide: YoutubeService, useValue: youtubeService },
        {
          provide: YoutubeAuthorizedSignalsService,
          useValue: youtubeAuthorizedSignalsService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<YoutubeController>(YoutubeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('connect', () => {
    const dto = { brandId: brandId.toString() };

    it('should return Google OAuth URL', async () => {
      const result = await controller.connect(mockRequest, mockUser, dto);
      expect(result).toEqual({
        url: expect.stringContaining('accounts.google.com'),
      });
    });

    it('should start OAuth through the canonical credential boundary', async () => {
      await controller.connect(mockRequest, mockUser, dto);
      expect(credentialsService.beginOAuthForBrand).toHaveBeenCalledWith(
        mockBrand,
        userId,
        'youtube',
        { isConnected: false },
      );
    });

    it('should throw FORBIDDEN when brand not found', async () => {
      brandsService.findOne.mockResolvedValueOnce(null);
      await expect(
        controller.connect(mockRequest, mockUser, dto),
      ).rejects.toThrow(HttpException);
    });

    it('should include YouTube scopes in auth URL request', async () => {
      await controller.connect(mockRequest, mockUser, dto);
      expect(youtubeService.generateAuthUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: expect.arrayContaining([
            'https://www.googleapis.com/auth/youtube',
            'https://www.googleapis.com/auth/youtube.upload',
          ]),
        }),
      );
    });
  });

  describe('verify', () => {
    const state = 'opaque-oauth-state';
    const dto = { code: 'google_auth_code', state };

    it('should exchange code and update credential', async () => {
      await controller.verify(mockRequest, dto);
      expect(youtubeService.exchangeCodeForTokens).toHaveBeenCalledWith(
        'google_auth_code',
      );
      expect(credentialsService.patch).toHaveBeenCalledWith(
        credentialId,
        expect.objectContaining({
          accessToken: 'yt_access',
          accessTokenExpiry: expect.any(Date),
          isConnected: true,
          oauthState: null,
          oauthToken: null,
          oauthTokenSecret: null,
          refreshToken: 'yt_refresh',
          grantedScopes: ['youtube'],
          grantedScopesCapturedAt: expect.any(Date),
        }),
      );
      expect(credentialsService.updateExternalProfile).toHaveBeenCalledWith(
        credentialId,
        orgId,
        expect.objectContaining({
          avatarUrl: 'https://youtube.example/avatar.jpg',
          handle: 'mychannel',
          id: 'UCxxxxxx',
          name: 'My Channel',
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

    it('should throw INTERNAL_SERVER_ERROR when refresh token not saved', async () => {
      credentialsService.findOne.mockResolvedValueOnce({
        id: credentialId,
        refreshToken: null,
      });
      await expect(controller.verify(mockRequest, dto)).rejects.toThrow(
        HttpException,
      );
    });

    it('should get channel details after credential save', async () => {
      await controller.verify(mockRequest, dto);
      expect(youtubeService.getChannelDetails).toHaveBeenCalledWith(
        orgId.toString(),
        brandId.toString(),
        expect.objectContaining({ setCredentials: expect.any(Function) }),
      );
    });

    it('refreshes authorized warm-up signals after a successful connection', async () => {
      await controller.verify(mockRequest, dto);
      expect(youtubeAuthorizedSignalsService.refresh).toHaveBeenCalledWith({
        accessToken: 'yt_access',
        credentialId,
        force: true,
        grantedScopes: 'youtube',
        organizationId: orgId,
      });
    });

    it('should still return credential even if channel details fail', async () => {
      youtubeService.getChannelDetails.mockRejectedValueOnce(
        new Error('API Error'),
      );
      const result = await controller.verify(mockRequest, dto);
      // Should not throw; channel details failure is non-fatal
      expect(result).toBeDefined();
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
      youtubeAuthorizedSignalsService.refresh.mockRejectedValueOnce(
        new NotFoundException('YouTube credential'),
      );

      await expect(
        controller.refreshAuthorizedSignals(
          mockRequest,
          mockUser,
          'missing-credential',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(credentialsService.findOne).not.toHaveBeenCalled();
    });

    it('refreshes and returns only the caller organization credential', async () => {
      credentialsService.findOne.mockResolvedValueOnce({
        id: credentialId,
        organizationId: orgId,
        platform: 'youtube',
      });

      const result = await controller.refreshAuthorizedSignals(
        mockRequest,
        mockUser,
        credentialId,
      );

      expect(youtubeAuthorizedSignalsService.refresh).toHaveBeenCalledWith({
        credentialId,
        organizationId: orgId,
      });
      expect(credentialsService.findOne).toHaveBeenCalledWith({
        id: credentialId,
        organizationId: orgId,
        platform: 'youtube',
      });
      expect(result).toEqual(
        expect.objectContaining({
          id: credentialId,
          organizationId: orgId,
        }),
      );
    });
  });

  describe('getTrends', () => {
    it('should return YouTube trends', async () => {
      const result = await controller.getTrends();
      expect(result).toEqual([{ title: 'trending video' }]);
    });

    it('should throw INTERNAL_SERVER_ERROR on failure', async () => {
      youtubeService.getTrends.mockRejectedValueOnce(
        new Error('Quota exceeded'),
      );
      await expect(controller.getTrends()).rejects.toThrow(HttpException);
    });
  });

  describe('getVideoMetadata', () => {
    it('should return video metadata with success true', async () => {
      const result = await controller.getVideoMetadata('abc123');
      expect(result).toEqual({
        data: expect.objectContaining({ title: 'Test Video' }),
        success: true,
      });
    });

    it('should return success false when no metadata found', async () => {
      youtubeService.getVideoMetadata.mockResolvedValueOnce(null);
      const result = await controller.getVideoMetadata('invalid');
      expect(result).toEqual({ data: null, success: false });
    });
  });
});
