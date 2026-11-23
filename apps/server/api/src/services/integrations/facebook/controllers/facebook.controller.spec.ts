import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { FacebookController } from '@api/services/integrations/facebook/controllers/facebook.controller';
import { FacebookService } from '@api/services/integrations/facebook/services/facebook.service';
import { FacebookPageConnectionService } from '@api/services/integrations/facebook/services/facebook-page-connection.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
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
    listManagedPages: vi.fn().mockResolvedValue([]),
    schedulePost: vi.fn(),
    uploadImage: vi.fn(),
    uploadVideo: vi.fn(),
  };

  const mockCredentialsService = {
    beginOAuthForBrand: vi.fn().mockResolvedValue({
      credential: { id: 'test-object-id' },
      state: 'opaque-oauth-state',
    }),
    claimPendingOAuthCredential: vi.fn().mockResolvedValue({
      id: 'test-object-id',
      externalId: undefined,
      organizationId: 'test-object-id',
      platform: CredentialPlatform.FACEBOOK,
    }),
    connectAccount: vi.fn(),
    createPendingForBrand: vi.fn(),
    findConnectedAccounts: vi.fn().mockResolvedValue([]),
    patch: vi.fn().mockResolvedValue({ id: 'cred-1' }),
    updateExternalProfile: vi.fn().mockResolvedValue({ id: 'cred-1' }),
    findOne: vi.fn().mockResolvedValue(null),
  };

  const mockBrandsService = {
    findOne: vi.fn().mockResolvedValue({
      id: 'test-object-id',
      organizationId: 'test-object-id',
      userId: 'test-object-id',
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
        FacebookPageConnectionService,
        {
          provide: BrandsService,
          useValue: mockBrandsService,
        },
        {
          provide: CredentialsService,
          useValue: mockCredentialsService,
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
    mockFacebookService.listManagedPages.mockResolvedValue([]);
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
        mockCredentialsService.claimPendingOAuthCredential,
      ).toHaveBeenCalledWith('opaque-oauth-state', CredentialPlatform.FACEBOOK);
      expect(mockCredentialsService.patch).toHaveBeenCalledWith(
        'test-object-id',
        expect.objectContaining({
          grantedScopes: ['ads_management', 'ads_read'],
          grantedScopesCapturedAt: expect.any(Date),
        }),
      );
      // A personal Facebook profile has no public @handle through Graph —
      // only a name and a (private) email. Neither may be persisted as one.
      expect(mockCredentialsService.updateExternalProfile).toHaveBeenCalledWith(
        'cred-1',
        'test-object-id',
        {
          avatarUrl: 'https://facebook.example/avatar.jpg',
          handle: undefined,
          id: 'fb-user-1',
          name: 'Person',
        },
      );
      expect(result).toMatchObject({ data: { type: 'credential' } });
    });

    it('connects the only managed Page as the channel', async () => {
      mockFacebookService.exchangeAuthCodeForAccessToken.mockResolvedValue({
        accessToken: 'facebook-token',
        expiresIn: 3600,
      });
      mockFacebookService.getUserProfile.mockResolvedValue({
        id: 'fb-user-1',
        name: 'Person',
      });
      mockFacebookService.getGrantedPermissions.mockResolvedValue([
        'pages_manage_posts',
      ]);
      mockFacebookService.listManagedPages.mockResolvedValue([
        {
          id: '111',
          name: 'Acme Page',
          picture: 'https://facebook.example/page.jpg',
        },
      ]);
      mockCredentialsService.patch.mockResolvedValueOnce({
        id: 'cred-1',
        organizationId: 'test-object-id',
        platform: CredentialPlatform.FACEBOOK,
      });
      mockCredentialsService.connectAccount.mockResolvedValue({
        externalId: '111',
        id: 'cred-1',
        isConnected: true,
        platform: CredentialPlatform.FACEBOOK,
      });

      const result = await controller.verify({} as never, {
        code: 'auth-code',
        state: 'opaque-oauth-state',
      });

      expect(mockCredentialsService.connectAccount).toHaveBeenCalledWith(
        'cred-1',
        'test-object-id',
        {
          avatarUrl: 'https://facebook.example/page.jpg',
          handle: undefined,
          id: '111',
          name: 'Acme Page',
        },
      );
      expect(result).toMatchObject({
        data: { attributes: { externalId: '111' } },
      });
    });

    it('leaves the connection pending when several Pages are managed', async () => {
      mockFacebookService.exchangeAuthCodeForAccessToken.mockResolvedValue({
        accessToken: 'facebook-token',
        expiresIn: 3600,
      });
      mockFacebookService.getUserProfile.mockResolvedValue({
        id: 'fb-user-1',
        name: 'Person',
      });
      mockFacebookService.getGrantedPermissions.mockResolvedValue([
        'pages_manage_posts',
      ]);
      mockFacebookService.listManagedPages.mockResolvedValue([
        { id: '111', name: 'Page One' },
        { id: '222', name: 'Page Two' },
      ]);
      mockCredentialsService.patch.mockResolvedValueOnce({
        accessToken: 'encrypted',
        id: 'cred-1',
        isConnected: false,
        platform: CredentialPlatform.FACEBOOK,
      });

      const result = await controller.verify({} as never, {
        code: 'auth-code',
        state: 'opaque-oauth-state',
      });

      expect(mockCredentialsService.patch).toHaveBeenCalledWith(
        'test-object-id',
        expect.objectContaining({ isConnected: false }),
      );
      expect(result).toMatchObject({
        data: { attributes: { needsAccountSelection: true } },
      });
    });

    it('refuses the connection when Facebook cannot list the Pages', async () => {
      mockFacebookService.exchangeAuthCodeForAccessToken.mockResolvedValue({
        accessToken: 'facebook-token',
        expiresIn: 3600,
      });
      mockFacebookService.getUserProfile.mockResolvedValue({
        id: 'fb-user-1',
        name: 'Person',
      });
      mockFacebookService.getGrantedPermissions.mockResolvedValue([]);
      mockFacebookService.listManagedPages.mockRejectedValue(
        new Error('Graph unavailable'),
      );

      await expect(
        controller.verify({} as never, {
          code: 'auth-code',
          state: 'opaque-oauth-state',
        }),
      ).rejects.toThrow('Facebook could not list your Pages');
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

      const verified = await controller.verify({} as never, {
        code: 'auth-code',
        state: 'opaque-oauth-state',
      });

      expect(verified).toMatchObject({ data: { type: 'credential' } });

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

      const verified = await controller.verify({} as never, {
        code: 'auth-code',
        state: 'opaque-oauth-state',
      });

      expect(verified).toMatchObject({ data: { type: 'credential' } });
      expect(mockCredentialsService.patch).toHaveBeenCalledWith(
        'test-object-id',
        expect.objectContaining({
          grantedScopes: ['ads_management', 'ads_read'],
        }),
      );
    });

    it('rejects a callback whose state matches no pending credential', async () => {
      mockCredentialsService.claimPendingOAuthCredential.mockResolvedValueOnce(
        null,
      );
      mockCredentialsService.findOne.mockResolvedValueOnce(null);

      await expect(
        controller.verify({} as never, {
          code: 'auth-code',
          state: 'unknown-state',
        }),
      ).rejects.toBeInstanceOf(HttpException);
    });

    it('throws when code or state is missing', async () => {
      await expect(
        controller.verify({} as never, { code: 'auth-code' }),
      ).rejects.toBeInstanceOf(HttpException);
    });
  });

  describe('Page selection for a pending connection', () => {
    const pendingCredential = {
      accessToken: EncryptionUtil.encrypt('user-token'),
      accessTokenExpiry: new Date('2026-12-01T00:00:00.000Z'),
      brandId: 'brand-1',
      grantedScopes: ['pages_manage_posts'],
      grantedScopesCapturedAt: new Date('2026-11-23T00:00:00.000Z'),
      id: 'cred-pending',
      isConnected: false,
      organizationId: 'test-object-id',
      platform: CredentialPlatform.FACEBOOK,
      userId: 'user-1',
    };
    const managedPages = [
      {
        id: '111',
        name: 'Page One',
        picture: 'https://facebook.example/1.jpg',
      },
      { id: '222', name: 'Page Two' },
    ];

    it('lists the managed Pages and flags those another credential holds', async () => {
      mockCredentialsService.findOne.mockResolvedValue(pendingCredential);
      mockFacebookService.listManagedPages.mockResolvedValue(managedPages);
      mockCredentialsService.findConnectedAccounts.mockResolvedValue([
        { externalId: '222', id: 'cred-other' },
      ]);

      const result = await controller.listPendingPages(
        mockUser,
        'cred-pending',
      );

      expect(mockFacebookService.listManagedPages).toHaveBeenCalledWith(
        'user-token',
      );
      expect(result.pages).toEqual([
        { ...managedPages[0], isAlreadyConnected: false },
        { ...managedPages[1], isAlreadyConnected: true },
      ]);
    });

    it('refuses to list Pages for a credential that already has one', async () => {
      mockCredentialsService.findOne.mockResolvedValue({
        ...pendingCredential,
        externalId: '111',
        isConnected: true,
      });

      await expect(
        controller.listPendingPages(mockUser, 'cred-pending'),
      ).rejects.toThrow('already connected to a Page');
    });

    it('connects the first Page to the credential and each further Page to its own credential', async () => {
      mockCredentialsService.findOne.mockResolvedValue(pendingCredential);
      mockFacebookService.listManagedPages.mockResolvedValue(managedPages);
      mockCredentialsService.connectAccount
        .mockResolvedValueOnce({
          externalId: '111',
          id: 'cred-pending',
          isConnected: true,
          platform: CredentialPlatform.FACEBOOK,
        })
        .mockResolvedValueOnce({
          externalId: '222',
          id: 'cred-sibling',
          isConnected: true,
          platform: CredentialPlatform.FACEBOOK,
        });
      mockCredentialsService.createPendingForBrand.mockResolvedValue({
        id: 'cred-sibling',
      });

      const result = await controller.selectPages(
        {} as never,
        mockUser,
        'cred-pending',
        { pageIds: ['111', '222'] },
      );

      expect(
        (result as { data: Array<{ attributes: { externalId: string } }> }).data
          .map((credential) => credential.attributes.externalId)
          .sort(),
      ).toEqual(['111', '222']);
      // The sibling carries a copy of the one Facebook grant, so it can be
      // disconnected on its own.
      expect(mockCredentialsService.connectAccount).toHaveBeenLastCalledWith(
        'cred-sibling',
        'test-object-id',
        {
          avatarUrl: undefined,
          handle: undefined,
          id: '222',
          name: 'Page Two',
        },
        expect.objectContaining({
          accessToken: 'user-token',
          grantedScopes: ['pages_manage_posts'],
        }),
      );
    });

    it('rejects a Page the Facebook account does not manage', async () => {
      mockCredentialsService.findOne.mockResolvedValue(pendingCredential);
      mockFacebookService.listManagedPages.mockResolvedValue(managedPages);

      await expect(
        controller.selectPages({} as never, mockUser, 'cred-pending', {
          pageIds: ['999'],
        }),
      ).rejects.toThrow('not available to this Facebook account');
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
        mediaType: 'image' as const,
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
        mediaType: 'video' as const,
        mediaUrl: 'https://example.com/video.mp4',
        message: 'Video post',
        pageAccessToken: 'token123',
        pageId: 'page123',
      };

      const postId = 'post_125';
      mockFacebookService.uploadVideo.mockResolvedValue(postId);

      const result = await controller.createPost(mockUser, body);

      expect(facebookService.uploadVideo).toHaveBeenCalledWith(
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

      expect(result.postId).toBe(postId);
    });
  });

  describe('getPostAnalytics', () => {
    it('collects the Video node when mediaType is video', async () => {
      mockFacebookService.getPostAnalytics.mockResolvedValue({ views: 42 });
      const result = await controller.getPostAnalytics(
        mockUser,
        'video',
        'page-token',
        'video',
      );
      expect(result).toEqual({ views: 42 });
      expect(facebookService.getPostAnalytics).toHaveBeenCalledWith(
        'video',
        'page-token',
        undefined,
        true,
      );
    });

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
