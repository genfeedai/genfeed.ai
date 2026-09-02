import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsController } from '@api/collections/credentials/controllers/credentials.controller';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { FacebookService } from '@api/services/integrations/facebook/services/facebook.service';
import { GoogleAdsService } from '@api/services/integrations/google-ads/services/google-ads.service';
import { GoogleSearchConsoleService } from '@api/services/integrations/google-search-console/services/google-search-console.service';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { LinkedInService } from '@api/services/integrations/linkedin/services/linkedin.service';
import { PinterestService } from '@api/services/integrations/pinterest/services/pinterest.service';
import { RedditService } from '@api/services/integrations/reddit/services/reddit.service';
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { CredentialPlatform } from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('CredentialsController', () => {
  let controller: CredentialsController;
  let credentialsService: Record<string, ReturnType<typeof vi.fn>>;
  let brandsService: Record<string, ReturnType<typeof vi.fn>>;
  let instagramService: Record<string, ReturnType<typeof vi.fn>>;

  const userId = testId('user');
  const orgId = testId('org');
  const credId = testId('cred');
  const brandEntityId = testId('brand');

  const mockUser = {
    id: 'authProvider_user_123',
    organizationId: orgId,
    userId: userId,
  } as never;

  const mockRequest = {
    get: vi.fn().mockReturnValue('localhost'),
    headers: {},
    path: '/credentials',
    protocol: 'https',
  } as never;

  const createMockPlatformService = () => ({
    refreshToken: vi.fn().mockResolvedValue({}),
  });

  beforeEach(() => {
    credentialsService = {
      create: vi.fn(),
      find: vi.fn().mockResolvedValue([]),
      findAll: vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 }),
      findOne: vi.fn(),
      patch: vi.fn(),
      remove: vi.fn(),
      createAndAttachTag: vi.fn(),
      updateExternalProfile: vi.fn(),
    };
    brandsService = { findOne: vi.fn() };
    instagramService = {
      ...createMockPlatformService(),
      getInstagramPages: vi.fn().mockResolvedValue([]),
    };

    controller = new CredentialsController(
      brandsService as unknown as BrandsService,
      credentialsService as unknown as CredentialsService,
      createMockPlatformService() as unknown as FacebookService,
      createMockPlatformService() as unknown as GoogleAdsService,
      createMockPlatformService() as unknown as GoogleSearchConsoleService,
      instagramService as unknown as InstagramService,
      createMockPlatformService() as unknown as LinkedInService,
      createMockPlatformService() as unknown as PinterestService,
      createMockPlatformService() as unknown as RedditService,
      createMockPlatformService() as unknown as TiktokService,
      createMockPlatformService() as unknown as TwitterService,
      createMockPlatformService() as unknown as YoutubeService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return credentials for the current user', async () => {
      credentialsService.findAll.mockResolvedValue({
        docs: [{ id: credId }],
        totalDocs: 1,
      });

      const result = await controller.findAll(
        {} as never,
        mockRequest,
        mockUser,
      );

      expect(credentialsService.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('findOne', () => {
    it('should return a credential when found', async () => {
      credentialsService.findOne.mockResolvedValue({
        id: credId,
      });

      const result = await controller.findOne(mockRequest, credId);

      expect(result).toBeDefined();
    });

    it('should throw when credential not found', async () => {
      credentialsService.findOne.mockResolvedValue(null);
      const missingId = testId('missing');

      await expect(controller.findOne(mockRequest, missingId)).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('refreshCredentialToken', () => {
    it('should refresh token for supported platform', async () => {
      credentialsService.findOne
        .mockResolvedValueOnce({
          brandId: brandEntityId,
          id: credId,
          organizationId: orgId,
          platform: CredentialPlatform.TWITTER,
        })
        .mockResolvedValueOnce({
          id: credId,
          platform: CredentialPlatform.TWITTER,
        });

      const result = await controller.refreshCredentialToken(
        mockRequest,
        credId,
        mockUser,
      );

      expect(result).toBeDefined();
    });

    it('refreshes a Prisma SCREAMING twitter credential', async () => {
      credentialsService.findOne
        .mockResolvedValueOnce({
          brandId: brandEntityId,
          id: credId,
          organizationId: orgId,
          platform: 'TWITTER',
        })
        .mockResolvedValueOnce({
          id: credId,
          platform: 'TWITTER',
        });

      const result = await controller.refreshCredentialToken(
        mockRequest,
        credId,
        mockUser,
      );

      expect(result).toBeDefined();
    });

    it('should throw when credential not found for refresh', async () => {
      credentialsService.findOne.mockResolvedValue(null);
      const missingId = testId('missing');

      await expect(
        controller.refreshCredentialToken(mockRequest, missingId, mockUser),
      ).rejects.toThrow(HttpException);
    });

    it('rejects OAuth 1.0a X Ads credentials because their access tokens do not refresh', async () => {
      credentialsService.findOne.mockResolvedValueOnce({
        brandId: brandEntityId,
        id: credId,
        organizationId: orgId,
        platform: CredentialPlatform.X_ADS,
      });

      await expect(
        controller.refreshCredentialToken(mockRequest, credId, mockUser),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });

      expect(credentialsService.patch).not.toHaveBeenCalled();
    });

    it('should mark credential as disconnected when refresh fails', async () => {
      const failingTwitter = {
        refreshToken: vi.fn().mockRejectedValue(new Error('Token expired')),
      };
      const failController = new CredentialsController(
        brandsService as unknown as BrandsService,
        credentialsService as unknown as CredentialsService,
        createMockPlatformService() as unknown as FacebookService,
        createMockPlatformService() as unknown as GoogleAdsService,
        createMockPlatformService() as unknown as GoogleSearchConsoleService,
        instagramService as unknown as InstagramService,
        createMockPlatformService() as unknown as LinkedInService,
        createMockPlatformService() as unknown as PinterestService,
        createMockPlatformService() as unknown as RedditService,
        createMockPlatformService() as unknown as TiktokService,
        failingTwitter as unknown as TwitterService,
        createMockPlatformService() as unknown as YoutubeService,
      );

      credentialsService.findOne.mockResolvedValueOnce({
        brandId: brandEntityId,
        id: credId,
        organizationId: orgId,
        platform: CredentialPlatform.TWITTER,
      });

      await expect(
        failController.refreshCredentialToken(mockRequest, credId, mockUser),
      ).rejects.toThrow(HttpException);

      expect(credentialsService.patch).toHaveBeenCalledWith(expect.anything(), {
        isConnected: false,
      });
    });
  });

  describe('update', () => {
    it('should update allowed fields on a credential', async () => {
      credentialsService.findOne.mockResolvedValue({
        id: credId,
      });
      credentialsService.patch.mockResolvedValue({
        id: credId,
        label: 'Updated',
      });

      const result = await controller.update(
        mockRequest,
        credId,
        { label: 'Updated' } as never,
        mockUser,
      );

      expect(credentialsService.patch).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw when credential not found for update', async () => {
      credentialsService.findOne.mockResolvedValue(null);
      const missingId = testId('missing');

      await expect(
        controller.update(
          mockRequest,
          missingId,
          { label: 'X' } as never,
          mockUser,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('imports submitted provider avatars instead of persisting hotlinks', async () => {
      credentialsService.findOne.mockResolvedValue({ id: credId });
      credentialsService.updateExternalProfile.mockResolvedValue({
        externalAvatar:
          'https://cdn.genfeed.ai/ingredients/social-avatars/credential-1',
        id: credId,
      });

      await controller.update(
        mockRequest,
        credId,
        {
          externalAvatar: 'https://instagram.example/avatar.jpg',
          externalHandle: 'genfeed',
          externalName: 'Genfeed',
        } as never,
        mockUser,
      );

      expect(credentialsService.patch).not.toHaveBeenCalled();
      expect(credentialsService.updateExternalProfile).toHaveBeenCalledWith(
        credId,
        orgId,
        {
          avatarUrl: 'https://instagram.example/avatar.jpg',
          handle: 'genfeed',
          id: undefined,
          name: 'Genfeed',
        },
      );
    });
  });

  describe('remove', () => {
    it('should soft-delete a credential owned by the user', async () => {
      credentialsService.findOne.mockResolvedValue({
        id: credId,
      });
      credentialsService.remove.mockResolvedValue({
        id: credId,
        isDeleted: true,
      });

      const result = await controller.remove(credId, mockUser, mockRequest);

      expect(credentialsService.remove).toHaveBeenCalledWith(credId);
      expect(result).toBeDefined();
    });

    it('should throw when credential not found for deletion', async () => {
      credentialsService.findOne.mockResolvedValue(null);
      const missingId = testId('missing');

      await expect(
        controller.remove(missingId, mockUser, mockRequest),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('createCredentialTag', () => {
    it('creates and attaches a tag inside the authenticated organization', async () => {
      credentialsService.createAndAttachTag.mockResolvedValue({
        id: credId,
        tags: [{ id: 'tag-1', label: 'Creator' }],
      });

      await controller.createCredentialTag(
        mockRequest,
        credId,
        { label: 'Creator' } as never,
        mockUser,
      );

      expect(credentialsService.createAndAttachTag).toHaveBeenCalledWith(
        credId,
        orgId,
        userId,
        { label: 'Creator' },
      );
    });
  });
});
