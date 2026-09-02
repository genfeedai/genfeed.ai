import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { FacebookController } from '@api/services/integrations/facebook/controllers/facebook.controller';
import { FacebookService } from '@api/services/integrations/facebook/services/facebook.service';
import { CredentialPlatform } from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

describe('FacebookController', () => {
  let controller: FacebookController;
  let facebookService: FacebookService;

  const mockUser: User = {
    brandId: testId('brand'),
    organizationId: testId('org'),
    userId: testId('user'),
  } as unknown as User;

  const mockFacebookService = {
    createTextPost: vi.fn(),
    exchangeAuthCodeForAccessToken: vi.fn(),
    generateAuthUrl: vi.fn(),
    getPostAnalytics: vi.fn(),
    getGrantedPermissions: vi.fn(),
    getUserPages: vi.fn(),
    getUserProfile: vi.fn(),
    schedulePost: vi.fn(),
    uploadImage: vi.fn(),
    uploadVideoByUrl: vi.fn(),
  };

  const mockCredentialsService = {
    beginOAuthForBrand: vi.fn().mockResolvedValue({
      credential: { id: 'test-object-id' },
      state: 'opaque-oauth-state',
    }),
    findPendingOAuthCredential: vi.fn().mockResolvedValue({
      id: 'test-object-id',
      externalId: undefined,
      organizationId: 'test-object-id',
      platform: CredentialPlatform.FACEBOOK,
    }),
    patch: vi.fn().mockResolvedValue({ id: 'cred-1' }),
    updateExternalProfile: vi.fn().mockResolvedValue({ id: 'cred-1' }),
  };

  const mockBrandsService = {
    findOne: vi.fn().mockResolvedValue({
      id: 'test-object-id',
      organizationId: 'test-object-id',
      userId: 'test-object-id',
    }),
  };

  const mockConfigService = {
    get: vi.fn((key: string) => {
      if (key === 'GENFEEDAI_APP_URL') {
        return 'https://app.genfeed.ai';
      }
      return null;
    }),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FacebookController],
      providers: [
        {
          provide: BrandsService,
          useValue: mockBrandsService,
        },
        {
          provide: CredentialsService,
          useValue: mockCredentialsService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: FacebookService,
          useValue: mockFacebookService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<FacebookController>(FacebookController);
    facebookService = module.get<FacebookService>(FacebookService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('verify', () => {
    it('persists a verified facebook credential', async () => {
      mockFacebookService.exchangeAuthCodeForAccessToken.mockResolvedValue({
        accessToken: 'facebook-token',
        expiresIn: 3600,
      });
      mockFacebookService.getUserProfile.mockResolvedValue({
        email: 'person@example.com',
        id: 'fb-user-1',
        name: 'Person',
        picture: { data: { url: 'https://facebook.example/avatar.jpg' } },
      });
      mockFacebookService.getGrantedPermissions.mockResolvedValue([
        'ads_management',
        'ads_read',
      ]);

      const result = await controller.verify({} as never, {
        code: 'auth-code',
        state: 'opaque-oauth-state',
      });

      expect(
        mockCredentialsService.findPendingOAuthCredential,
      ).toHaveBeenCalledWith('opaque-oauth-state', CredentialPlatform.FACEBOOK);
      expect(mockCredentialsService.patch).toHaveBeenCalledWith(
        'test-object-id',
        expect.objectContaining({
          grantedScopes: ['ads_management', 'ads_read'],
          grantedScopesCapturedAt: expect.any(Date),
        }),
      );
      expect(mockCredentialsService.updateExternalProfile).toHaveBeenCalledWith(
        'cred-1',
        'test-object-id',
        {
          avatarUrl: 'https://facebook.example/avatar.jpg',
          handle: 'person@example.com',
          id: 'fb-user-1',
          name: 'Person',
        },
      );
      expect(result).toBeDefined();
    });

    it('keeps the connection when permission capture is temporarily unavailable', async () => {
      mockFacebookService.exchangeAuthCodeForAccessToken.mockResolvedValue({
        accessToken: 'facebook-token',
        expiresIn: 3600,
      });
      mockFacebookService.getUserProfile.mockResolvedValue({
        id: 'fb-user-1',
        name: 'Person',
      });
      mockFacebookService.getGrantedPermissions.mockRejectedValue(
        new Error('Graph permissions unavailable'),
      );

      await expect(
        controller.verify({} as never, {
          code: 'auth-code',
          state: 'opaque-oauth-state',
        }),
      ).resolves.toBeDefined();

      expect(mockCredentialsService.patch).toHaveBeenCalledWith(
        'test-object-id',
        expect.not.objectContaining({
          grantedScopes: expect.anything(),
          grantedScopesCapturedAt: expect.anything(),
        }),
      );
      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('permission capture failed'),
        expect.any(Error),
      );
    });

    it('falls back to the permissions endpoint when the token scope is malformed', async () => {
      mockFacebookService.exchangeAuthCodeForAccessToken.mockResolvedValue({
        accessToken: 'facebook-token',
        expiresIn: 3600,
        scope: '',
      });
      mockFacebookService.getUserProfile.mockResolvedValue({
        id: 'fb-user-1',
        name: 'Person',
      });
      mockFacebookService.getGrantedPermissions.mockResolvedValue([
        'ads_management',
        'ads_read',
      ]);

      await controller.verify({} as never, {
        code: 'auth-code',
        state: 'opaque-oauth-state',
      });

      expect(mockFacebookService.getGrantedPermissions).toHaveBeenCalledWith(
        'facebook-token',
      );
      expect(mockCredentialsService.patch).toHaveBeenCalledWith(
        'test-object-id',
        expect.objectContaining({
          grantedScopes: ['ads_management', 'ads_read'],
        }),
      );
    });

    it('throws when code or state is missing', async () => {
      await expect(
        controller.verify({} as never, { code: 'auth-code' }),
      ).rejects.toBeInstanceOf(HttpException);
    });
  });

  describe('handleCallback', () => {
    it('should redirect to dashboard on success', () => {
      const result = controller.handleCallback();

      expect(result.url).toContain('facebook=connected');
    });
  });

  describe('getUserPages', () => {
    it('should return user Facebook pages', async () => {
      const pages = [
        { accessToken: 'token1', id: 'page1', name: 'Page 1' },
        { accessToken: 'token2', id: 'page2', name: 'Page 2' },
      ];

      mockFacebookService.getUserPages.mockResolvedValue(pages);

      const result = await controller.getUserPages(mockUser);

      expect(facebookService.getUserPages).toHaveBeenCalledWith(
        mockUser.organizationId,
        mockUser.brandId,
      );
      expect(result.pages).toEqual(pages);
    });
  });

  describe('createPost', () => {
    it('should create text post', async () => {
      const body = {
        message: 'Test post',
        pageAccessToken: 'token123',
        pageId: 'page123',
      };

      const postId = 'post_123';
      mockFacebookService.createTextPost.mockResolvedValue(postId);

      const result = await controller.createPost(mockUser, body);

      expect(facebookService.createTextPost).toHaveBeenCalledWith(
        body.pageId,
        body.pageAccessToken,
        body.message,
      );
      expect(result.postId).toBe(postId);
    });

    it('should upload image post', async () => {
      const body = {
        mediaType: 'image',
        mediaUrl: 'https://example.com/image.jpg',
        message: 'Image post',
        pageAccessToken: 'token123',
        pageId: 'page123',
      };

      const postId = 'post_124';
      mockFacebookService.uploadImage.mockResolvedValue(postId);

      const result = await controller.createPost(mockUser, body);

      expect(facebookService.uploadImage).toHaveBeenCalledWith(
        body.pageId,
        body.pageAccessToken,
        body.mediaUrl,
        body.message,
      );
      expect(result.postId).toBe(postId);
    });

    it('should upload video post', async () => {
      const body = {
        mediaType: 'video',
        mediaUrl: 'https://example.com/video.mp4',
        message: 'Video post',
        pageAccessToken: 'token123',
        pageId: 'page123',
      };

      const postId = 'post_125';
      mockFacebookService.uploadVideoByUrl.mockResolvedValue(postId);

      const result = await controller.createPost(mockUser, body);

      expect(facebookService.uploadVideoByUrl).toHaveBeenCalledWith(
        body.pageId,
        body.pageAccessToken,
        body.mediaUrl,
        body.message,
        body.message,
      );
      expect(result.postId).toBe(postId);
    });
  });

  describe('schedulePost', () => {
    it('should schedule a post', async () => {
      const body = {
        message: 'Scheduled post',
        pageAccessToken: 'token123',
        pageId: 'page123',
        scheduledTime: '2024-12-31T12:00:00Z',
      };

      const postId = 'post_126';
      mockFacebookService.schedulePost.mockResolvedValue(postId);

      const result = await controller.schedulePost(mockUser, body);

      expect(facebookService.schedulePost).toHaveBeenCalled();
      expect(result.postId).toBe(postId);
    });
  });

  describe('getPostAnalytics', () => {
    it('should return post analytics', async () => {
      const id = 'post_123';
      const accessToken = 'token123';
      const analytics = {
        comments: 25,
        reactions: 100,
        shares: 50,
      };

      mockFacebookService.getPostAnalytics.mockResolvedValue(analytics);

      const result = await controller.getPostAnalytics(
        mockUser,
        id,
        accessToken,
      );

      expect(facebookService.getPostAnalytics).toHaveBeenCalledWith(
        id,
        accessToken,
      );
      expect(result).toEqual(analytics);
    });
  });
});
