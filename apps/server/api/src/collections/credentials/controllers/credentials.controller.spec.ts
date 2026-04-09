import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsController } from '@api/collections/credentials/controllers/credentials.controller';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { TagsService } from '@api/collections/tags/services/tags.service';
import { FacebookService } from '@api/services/integrations/facebook/services/facebook.service';
import { GoogleAdsService } from '@api/services/integrations/google-ads/services/google-ads.service';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { LinkedInService } from '@api/services/integrations/linkedin/services/linkedin.service';
import { PinterestService } from '@api/services/integrations/pinterest/services/pinterest.service';
import { RedditService } from '@api/services/integrations/reddit/services/reddit.service';
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { QuotaService } from '@api/services/quota/quota.service';
import { CredentialPlatform } from '@genfeedai/enums';
import { HttpException } from '@nestjs/common';
import { Types } from 'mongoose';

describe('CredentialsController', () => {
  let controller: CredentialsController;
  let credentialsService: Record<string, ReturnType<typeof vi.fn>>;
  let brandsService: Record<string, ReturnType<typeof vi.fn>>;
  let organizationsService: Record<string, ReturnType<typeof vi.fn>>;
  let tagsService: Record<string, ReturnType<typeof vi.fn>>;
  let instagramService: Record<string, ReturnType<typeof vi.fn>>;
  let quotaService: Record<string, ReturnType<typeof vi.fn>>;

  const userId = new Types.ObjectId().toString();
  const orgId = new Types.ObjectId().toString();
  const credId = new Types.ObjectId().toString();

  const mockUser = {
    id: 'clerk_user_123',
    publicMetadata: { organization: orgId, user: userId },
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
    };
    brandsService = { findOne: vi.fn() };
    organizationsService = { findOne: vi.fn() };
    tagsService = { create: vi.fn() };
    instagramService = {
      ...createMockPlatformService(),
      getInstagramPages: vi.fn().mockResolvedValue([]),
    };
    quotaService = { checkQuota: vi.fn() };

    controller = new CredentialsController(
      brandsService as unknown as BrandsService,
      credentialsService as unknown as CredentialsService,
      createMockPlatformService() as unknown as FacebookService,
      createMockPlatformService() as unknown as GoogleAdsService,
      instagramService as unknown as InstagramService,
      createMockPlatformService() as unknown as LinkedInService,
      organizationsService as unknown as OrganizationsService,
      createMockPlatformService() as unknown as PinterestService,
      quotaService as unknown as QuotaService,
      createMockPlatformService() as unknown as RedditService,
      tagsService as unknown as TagsService,
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
        docs: [{ _id: credId }],
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
        _id: new Types.ObjectId(credId),
      });

      const result = await controller.findOne(mockRequest, credId);

      expect(result).toBeDefined();
    });

    it('should throw when credential not found', async () => {
      credentialsService.findOne.mockResolvedValue(null);
      const missingId = new Types.ObjectId().toString();

      await expect(controller.findOne(mockRequest, missingId)).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('getMentions', () => {
    it('should return deduplicated mentions', async () => {
      credentialsService.find.mockResolvedValue([
        {
          _id: new Types.ObjectId(),
          externalHandle: '@user1',
          externalName: 'User One',
          platform: CredentialPlatform.TWITTER,
        },
        {
          _id: new Types.ObjectId(),
          externalHandle: '@user1',
          externalName: 'User One',
          platform: CredentialPlatform.TWITTER,
        },
        {
          _id: new Types.ObjectId(),
          externalHandle: '@user2',
          externalName: 'User Two',
          platform: CredentialPlatform.INSTAGRAM,
        },
      ]);

      const result = await controller.getMentions(mockUser);

      expect(result.mentions).toHaveLength(2);
    });

    it('should skip credentials without a handle', async () => {
      credentialsService.find.mockResolvedValue([
        {
          _id: new Types.ObjectId(),
          externalHandle: null,
          platform: CredentialPlatform.TWITTER,
        },
      ]);

      const result = await controller.getMentions(mockUser);

      expect(result.mentions).toHaveLength(0);
    });
  });

  describe('refreshCredentialToken', () => {
    it('should refresh token for supported platform', async () => {
      credentialsService.findOne
        .mockResolvedValueOnce({
          _id: new Types.ObjectId(credId),
          brand: new Types.ObjectId(),
          organization: new Types.ObjectId(orgId),
          platform: CredentialPlatform.TWITTER,
        })
        .mockResolvedValueOnce({
          _id: new Types.ObjectId(credId),
          platform: CredentialPlatform.TWITTER,
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
      const missingId = new Types.ObjectId().toString();

      await expect(
        controller.refreshCredentialToken(mockRequest, missingId, mockUser),
      ).rejects.toThrow(HttpException);
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
        instagramService as unknown as InstagramService,
        createMockPlatformService() as unknown as LinkedInService,
        organizationsService as unknown as OrganizationsService,
        createMockPlatformService() as unknown as PinterestService,
        quotaService as unknown as QuotaService,
        createMockPlatformService() as unknown as RedditService,
        tagsService as unknown as TagsService,
        createMockPlatformService() as unknown as TiktokService,
        failingTwitter as unknown as TwitterService,
        createMockPlatformService() as unknown as YoutubeService,
      );

      credentialsService.findOne.mockResolvedValueOnce({
        _id: new Types.ObjectId(credId),
        brand: new Types.ObjectId(),
        organization: new Types.ObjectId(orgId),
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
        _id: new Types.ObjectId(credId),
      });
      credentialsService.patch.mockResolvedValue({
        _id: new Types.ObjectId(credId),
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
      const missingId = new Types.ObjectId().toString();

      await expect(
        controller.update(
          mockRequest,
          missingId,
          { label: 'X' } as never,
          mockUser,
        ),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('remove', () => {
    it('should soft-delete a credential owned by the user', async () => {
      credentialsService.findOne.mockResolvedValue({
        _id: new Types.ObjectId(credId),
      });
      credentialsService.remove.mockResolvedValue({
        _id: new Types.ObjectId(credId),
        isDeleted: true,
      });

      const result = await controller.remove(credId, mockUser, mockRequest);

      expect(credentialsService.remove).toHaveBeenCalledWith(credId);
      expect(result).toBeDefined();
    });

    it('should throw when credential not found for deletion', async () => {
      credentialsService.findOne.mockResolvedValue(null);
      const missingId = new Types.ObjectId().toString();

      await expect(
        controller.remove(missingId, mockUser, mockRequest),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('getQuotaStatus', () => {
    it('should return quota status for a credential', async () => {
      credentialsService.findOne.mockResolvedValue({
        _id: new Types.ObjectId(credId),
      });
      organizationsService.findOne.mockResolvedValue({
        _id: new Types.ObjectId(orgId),
        label: 'Test Org',
      });
      quotaService.checkQuota.mockResolvedValue({
        limit: 500,
        remaining: 100,
      });

      const result = await controller.getQuotaStatus(credId, orgId, mockUser);

      expect(result.data.type).toBe('quota-status');
      expect(result.data.attributes).toEqual({
        limit: 500,
        remaining: 100,
      });
    });

    it('should throw NOT_FOUND when credential not found for quota', async () => {
      credentialsService.findOne.mockResolvedValue(null);

      await expect(
        controller.getQuotaStatus(credId, orgId, mockUser),
      ).rejects.toThrow(HttpException);
    });

    it('should throw NOT_FOUND when organization not found for quota', async () => {
      credentialsService.findOne.mockResolvedValue({
        _id: new Types.ObjectId(credId),
      });
      organizationsService.findOne.mockResolvedValue(null);

      await expect(
        controller.getQuotaStatus(credId, orgId, mockUser),
      ).rejects.toThrow(HttpException);
    });
  });
});
