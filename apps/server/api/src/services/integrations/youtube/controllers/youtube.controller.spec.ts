vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getPublicMetadata: vi.fn(() => ({
    brand: '507f1f77bcf86cd799439012',
    organization: '507f1f77bcf86cd799439011',
    user: '507f1f77bcf86cd799439013',
  })),
}));

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
import { ConfigService } from '@api/config/config.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { YoutubeController } from '@api/services/integrations/youtube/controllers/youtube.controller';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('YoutubeController', () => {
  let controller: YoutubeController;
  let brandsService: { findOne: ReturnType<typeof vi.fn> };
  let credentialsService: {
    findOne: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    saveCredentials: ReturnType<typeof vi.fn>;
  };
  let youtubeService: {
    exchangeCodeForTokens: ReturnType<typeof vi.fn>;
    generateAuthUrl: ReturnType<typeof vi.fn>;
    getChannelDetails: ReturnType<typeof vi.fn>;
    getTrends: ReturnType<typeof vi.fn>;
    getVideoMetadata: ReturnType<typeof vi.fn>;
  };

  const mockRequest = {} as unknown as Request;
  const mockUser = { id: 'clerk_user_1' } as never;
  const brandId = 'test-object-id';
  const orgId = '507f1f77bcf86cd799439011';
  const credentialId = 'test-object-id';

  const mockBrand = { _id: brandId, organization: orgId };

  beforeEach(async () => {
    brandsService = { findOne: vi.fn().mockResolvedValue(mockBrand) };
    credentialsService = {
      findOne: vi
        .fn()
        .mockResolvedValue({ _id: credentialId, refreshToken: 'rt_saved' }),
      patch: vi
        .fn()
        .mockImplementation((_id, data) =>
          Promise.resolve({ _id: credentialId, ...data }),
        ),
      saveCredentials: vi.fn().mockResolvedValue({ _id: credentialId }),
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
        id: 'UCxxxxxx',
        title: 'My Channel',
      }),
      getTrends: vi.fn().mockResolvedValue([{ title: 'trending video' }]),
      getVideoMetadata: vi.fn().mockResolvedValue({
        description: 'A video',
        title: 'Test Video',
        viewCount: '1000',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [YoutubeController],
      providers: [
        {
          provide: ConfigService,
          useValue: { get: vi.fn().mockReturnValue('mock-value') },
        },
        { provide: LoggerService, useValue: { error: vi.fn(), log: vi.fn() } },
        { provide: BrandsService, useValue: brandsService },
        { provide: CredentialsService, useValue: credentialsService },
        { provide: YoutubeService, useValue: youtubeService },
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
    const dto = { brand: brandId.toString() };

    it('should return Google OAuth URL', async () => {
      const result = await controller.connect(mockRequest, mockUser, dto);
      expect(result).toEqual({
        url: expect.stringContaining('accounts.google.com'),
      });
    });

    it('should create credential when none exists', async () => {
      credentialsService.findOne.mockResolvedValueOnce(null);
      await controller.connect(mockRequest, mockUser, dto);
      expect(credentialsService.saveCredentials).toHaveBeenCalled();
    });

    it('should not create duplicate credential if one exists', async () => {
      await controller.connect(mockRequest, mockUser, dto);
      expect(credentialsService.saveCredentials).not.toHaveBeenCalled();
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
    const state = JSON.stringify({
      brandId: brandId.toString(),
      organizationId: orgId.toString(),
    });
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
          isConnected: true,
          refreshToken: 'yt_refresh',
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
      // First call returns credential with refreshToken (verify save check)
      // We need findOne to return null for the pending credential check
      credentialsService.findOne.mockResolvedValueOnce(null); // pending credential check
      await expect(controller.verify(mockRequest, dto)).rejects.toThrow(
        HttpException,
      );
    });

    it('should throw INTERNAL_SERVER_ERROR when refresh token not saved', async () => {
      // First findOne: pending credential exists
      // Second findOne (verify save): no refresh token
      credentialsService.findOne
        .mockResolvedValueOnce({ _id: credentialId }) // pending
        .mockResolvedValueOnce({ _id: credentialId, refreshToken: null }); // verify save
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
