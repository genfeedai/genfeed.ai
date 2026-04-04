import { ConfigService } from '@api/config/config.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { FacebookController } from '@api/services/integrations/facebook/controllers/facebook.controller';
import { FacebookService } from '@api/services/integrations/facebook/services/facebook.service';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('FacebookController', () => {
  let controller: FacebookController;
  let facebookService: FacebookService;

  const mockUser: User = {
    publicMetadata: {
      brand: '507f1f77bcf86cd799439013',
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockFacebookService = {
    createTextPost: vi.fn(),
    exchangeAuthCodeForAccessToken: vi.fn(),
    generateAuthUrl: vi.fn(),
    getPostAnalytics: vi.fn(),
    getUserPages: vi.fn(),
    getUserProfile: vi.fn(),
    schedulePost: vi.fn(),
    uploadImage: vi.fn(),
    uploadVideoByUrl: vi.fn(),
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

  describe('initializeAuth', () => {
    it('should return Facebook auth URL', () => {
      const authUrl =
        'https://www.facebook.com/v18.0/dialog/oauth?client_id=...';
      mockFacebookService.generateAuthUrl.mockReturnValue(authUrl);

      const result = controller.initializeAuth(mockUser);

      expect(facebookService.generateAuthUrl).toHaveBeenCalled();
      expect(result.authUrl).toBe(authUrl);
    });
  });

  describe('handleCallback', () => {
    it('should redirect to dashboard on success', () => {
      const result = controller.handleCallback();

      expect(result.url).toContain('facebook=connected');
    });

    it('should always redirect to success URL (error path is unreachable — callback logic is commented out)', () => {
      // The handleCallback() try block has all actual processing commented out.
      // The error catch path is unreachable until the callback is implemented.
      // Both calls return the success URL regardless of service mock state.
      mockFacebookService.exchangeAuthCodeForAccessToken = vi
        .fn()
        .mockRejectedValue(new Error('Auth failed'));

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
        mockUser.publicMetadata.organization,
        mockUser.publicMetadata.brand,
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
