import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsController } from '@api/collections/credentials/controllers/credentials.controller';
import { AccountHealthService } from '@api/collections/credentials/services/account-health.service';
import { AccountPublishingContextService } from '@api/collections/credentials/services/account-publishing-context.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { TagsService } from '@api/collections/tags/services/tags.service';
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
import { QuotaService } from '@api/services/quota/quota.service';
import { CredentialPlatform } from '@genfeedai/enums';
import { HttpException } from '@nestjs/common';

describe('CredentialsController', () => {
  let controller: CredentialsController;
  let accountHealthService: Record<string, ReturnType<typeof vi.fn>>;
  let accountPublishingContextService: Record<string, ReturnType<typeof vi.fn>>;
  let credentialsService: Record<string, ReturnType<typeof vi.fn>>;
  let brandsService: Record<string, ReturnType<typeof vi.fn>>;
  let organizationsService: Record<string, ReturnType<typeof vi.fn>>;
  let tagsService: Record<string, ReturnType<typeof vi.fn>>;
  let instagramService: Record<string, ReturnType<typeof vi.fn>>;
  let quotaService: Record<string, ReturnType<typeof vi.fn>>;

  const userId = '507f191e810c19729de860ee'.toString();
  const orgId = '507f191e810c19729de860ee'.toString();
  const credId = '507f191e810c19729de860ee'.toString();

  const mockUser = {
    id: 'authProvider_user_123',
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

  const accountHealthSummary = {
    assessedAt: '2026-06-30T10:00:00.000Z',
    credentialId: credId,
    holdPublishing: true,
    holdReason: 'twitter publishing is held because account warmup is warming.',
    label: 'X Account',
    override: { isActive: false },
    platform: CredentialPlatform.TWITTER,
    riskLevel: 'medium',
    score: 56,
    signals: {
      connectedDays: 1,
      profileSignals: 2,
      publishedPosts: 0,
      recentFailures: 0,
    },
    state: 'warming',
    thresholds: {
      maxRecentFailures: 0,
      minConnectedDays: 10,
      minProfileSignals: 2,
      minPublishedPosts: 4,
    },
  };

  beforeEach(() => {
    accountHealthService = {
      assessCredentialHealth: vi.fn().mockResolvedValue(accountHealthSummary),
      confirmManualOverride: vi.fn().mockResolvedValue({
        ...accountHealthSummary,
        holdPublishing: false,
        override: { isActive: true },
      }),
      listBrandHealth: vi.fn().mockResolvedValue([accountHealthSummary]),
    };
    credentialsService = {
      create: vi.fn(),
      find: vi.fn().mockResolvedValue([]),
      findAll: vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 }),
      findOne: vi.fn(),
      patch: vi.fn(),
      remove: vi.fn(),
    };
    accountPublishingContextService = {
      resolve: vi.fn().mockResolvedValue({
        account: {
          id: credId,
          label: 'X Account',
          platform: CredentialPlatform.TWITTER,
        },
        constraints: {
          notes: [],
          supportsDirectPublishing: true,
          supportsRichArticleCopy: false,
          supportsThreads: true,
          usesWeightedCharacters: true,
        },
        promptHints: [],
        publishability: 'publishable',
        recentPosts: [],
        surface: 'post',
      }),
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
      accountHealthService as unknown as AccountHealthService,
      accountPublishingContextService as unknown as AccountPublishingContextService,
      brandsService as unknown as BrandsService,
      credentialsService as unknown as CredentialsService,
      createMockPlatformService() as unknown as FacebookService,
      createMockPlatformService() as unknown as GoogleAdsService,
      createMockPlatformService() as unknown as GoogleSearchConsoleService,
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
        _id: credId,
      });

      const result = await controller.findOne(mockRequest, credId);

      expect(result).toBeDefined();
    });

    it('should throw when credential not found', async () => {
      credentialsService.findOne.mockResolvedValue(null);
      const missingId = '507f191e810c19729de860ee'.toString();

      await expect(controller.findOne(mockRequest, missingId)).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('getMentions', () => {
    it('should return deduplicated mentions', async () => {
      credentialsService.find.mockResolvedValue([
        {
          _id: '507f191e810c19729de860ee',
          externalHandle: '@user1',
          externalName: 'User One',
          platform: CredentialPlatform.TWITTER,
        },
        {
          _id: '507f191e810c19729de860ee',
          externalHandle: '@user1',
          externalName: 'User One',
          platform: CredentialPlatform.TWITTER,
        },
        {
          _id: '507f191e810c19729de860ee',
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
          _id: '507f191e810c19729de860ee',
          externalHandle: null,
          platform: CredentialPlatform.TWITTER,
        },
      ]);

      const result = await controller.getMentions(mockUser);

      expect(result.mentions).toHaveLength(0);
    });
  });

  describe('getPublishingContext', () => {
    it('resolves account publishing context for the current brand and organization', async () => {
      const user = {
        ...mockUser,
        publicMetadata: {
          brand: 'brand-1',
          organization: orgId,
          user: userId,
        },
      } as never;

      const result = await controller.getPublishingContext(
        credId,
        'x-article',
        user,
      );

      expect(accountPublishingContextService.resolve).toHaveBeenCalledWith({
        brandId: 'brand-1',
        credentialId: credId,
        organizationId: orgId,
        surface: 'x-article',
      });
      expect(result).toBeDefined();
    });
  });

  describe('account health', () => {
    const user = {
      ...mockUser,
      publicMetadata: {
        brand: 'brand-1',
        organization: orgId,
        user: userId,
      },
    } as never;

    it('lists account health for a brand', async () => {
      const result = await controller.listBrandAccountHealth('brand-1', user);

      expect(accountHealthService.listBrandHealth).toHaveBeenCalledWith(
        orgId,
        'brand-1',
      );
      expect(result).toEqual([accountHealthSummary]);
    });

    it('assesses account health for the current brand and organization', async () => {
      const result = await controller.assessAccountHealth(
        credId,
        { thresholds: { minPublishedPosts: 1 } },
        user,
      );

      expect(accountHealthService.assessCredentialHealth).toHaveBeenCalledWith({
        brandId: 'brand-1',
        credentialId: credId,
        organizationId: orgId,
        request: { thresholds: { minPublishedPosts: 1 } },
      });
      expect(result).toEqual(accountHealthSummary);
    });

    it('confirms a manual account health override with the local user id', async () => {
      const request = {
        confirm: true,
        reason: 'operator reviewed guidance',
      } as const;

      const result = await controller.overrideAccountHealth(
        credId,
        request,
        user,
      );

      expect(accountHealthService.confirmManualOverride).toHaveBeenCalledWith({
        credentialId: credId,
        organizationId: orgId,
        request,
        userId,
      });
      expect(result.override.isActive).toBe(true);
    });
  });

  describe('refreshCredentialToken', () => {
    it('should refresh token for supported platform', async () => {
      credentialsService.findOne
        .mockResolvedValueOnce({
          _id: credId,
          brand: '507f191e810c19729de860ee',
          organization: orgId,
          platform: CredentialPlatform.TWITTER,
        })
        .mockResolvedValueOnce({
          _id: credId,
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
      const missingId = '507f191e810c19729de860ee'.toString();

      await expect(
        controller.refreshCredentialToken(mockRequest, missingId, mockUser),
      ).rejects.toThrow(HttpException);
    });

    it('should mark credential as disconnected when refresh fails', async () => {
      const failingTwitter = {
        refreshToken: vi.fn().mockRejectedValue(new Error('Token expired')),
      };
      const failController = new CredentialsController(
        accountHealthService as unknown as AccountHealthService,
        accountPublishingContextService as unknown as AccountPublishingContextService,
        brandsService as unknown as BrandsService,
        credentialsService as unknown as CredentialsService,
        createMockPlatformService() as unknown as FacebookService,
        createMockPlatformService() as unknown as GoogleAdsService,
        createMockPlatformService() as unknown as GoogleSearchConsoleService,
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
        _id: credId,
        brand: '507f191e810c19729de860ee',
        organization: orgId,
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
        _id: credId,
      });
      credentialsService.patch.mockResolvedValue({
        _id: credId,
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
      const missingId = '507f191e810c19729de860ee'.toString();

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
        _id: credId,
      });
      credentialsService.remove.mockResolvedValue({
        _id: credId,
        isDeleted: true,
      });

      const result = await controller.remove(credId, mockUser, mockRequest);

      expect(credentialsService.remove).toHaveBeenCalledWith(credId);
      expect(result).toBeDefined();
    });

    it('should throw when credential not found for deletion', async () => {
      credentialsService.findOne.mockResolvedValue(null);
      const missingId = '507f191e810c19729de860ee'.toString();

      await expect(
        controller.remove(missingId, mockUser, mockRequest),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('getQuotaStatus', () => {
    it('should return quota status for a credential', async () => {
      credentialsService.findOne.mockResolvedValue({
        _id: credId,
      });
      organizationsService.findOne.mockResolvedValue({
        _id: orgId,
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
        _id: credId,
      });
      organizationsService.findOne.mockResolvedValue(null);

      await expect(
        controller.getQuotaStatus(credId, orgId, mockUser),
      ).rejects.toThrow(HttpException);
    });
  });
});
