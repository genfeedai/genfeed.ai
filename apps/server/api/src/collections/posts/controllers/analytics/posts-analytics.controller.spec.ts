vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn((type, id) => ({
    errors: [
      { detail: `${type} ${id} not found`, status: '404', title: 'Not Found' },
    ],
    statusCode: 404,
  })),
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { PostsAnalyticsController } from '@api/collections/posts/controllers/analytics/posts-analytics.controller';
import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('PostsAnalyticsController', () => {
  let controller: PostsAnalyticsController;

  const mockUser = {
    id: 'user_123',
    publicMetadata: {
      brand: '507f1f77bcf86cd799439013',
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockPost = {
    _id: '507f1f77bcf86cd799439014',
    brand: '507f1f77bcf86cd799439013',
    credential: '507f1f77bcf86cd799439016',
    isDeleted: false,
    organization: '507f1f77bcf86cd799439012',
    user: '507f1f77bcf86cd799439011',
  };

  const mockCredential = {
    _id: '507f1f77bcf86cd799439016',
    isConnected: true,
    organization: '507f1f77bcf86cd799439012',
    platform: 'twitter',
  };

  const mockAnalyticsSummary = {
    comments: 10,
    likes: 100,
    postId: '507f1f77bcf86cd799439014',
    views: 1000,
  };

  const mockLoggerService = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockPostsService = {
    findAll: vi.fn(),
    findOne: vi.fn(),
    getCachedData: vi.fn().mockResolvedValue(null),
    setCachedData: vi.fn().mockResolvedValue(undefined),
  };

  const mockPostAnalyticsService = {
    getAnalyticsByDateRange: vi.fn(),
    getPostAnalyticsSummary: vi.fn(),
    trackPostAnalytics: vi.fn().mockResolvedValue(undefined),
  };

  const mockCredentialsService = {
    findOne: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PostsAnalyticsController],
      providers: [
        {
          provide: CredentialsService,
          useValue: mockCredentialsService,
        },
        {
          provide: PostsService,
          useValue: mockPostsService,
        },
        {
          provide: PostAnalyticsService,
          useValue: mockPostAnalyticsService,
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

    controller = module.get<PostsAnalyticsController>(PostsAnalyticsController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getAnalytics', () => {
    const postId = '507f1f77bcf86cd799439014';

    it('should return post analytics', async () => {
      mockPostsService.findOne.mockResolvedValue(mockPost);
      mockPostAnalyticsService.getPostAnalyticsSummary.mockResolvedValue(
        mockAnalyticsSummary,
      );

      const result = await controller.getAnalytics(mockUser, postId);

      expect(mockPostsService.findOne).toHaveBeenCalled();
      expect(
        mockPostAnalyticsService.getPostAnalyticsSummary,
      ).toHaveBeenCalledWith(postId);
      expect(result).toBeDefined();
      expect(result.data?.type).toBe('post-analytics');
      expect(result.data?.attributes).toBeDefined();
    });

    it('should return not found when post does not exist', async () => {
      mockPostsService.findOne.mockResolvedValue(null);

      const result = await controller.getAnalytics(mockUser, postId);

      expect(result).toHaveProperty('statusCode', 404);
    });

    it('should include date range analytics when dates are provided', async () => {
      mockPostsService.findOne.mockResolvedValue(mockPost);
      mockPostAnalyticsService.getPostAnalyticsSummary.mockResolvedValue(
        mockAnalyticsSummary,
      );
      mockPostAnalyticsService.getAnalyticsByDateRange.mockResolvedValue({
        data: [],
      });

      const result = await controller.getAnalytics(
        mockUser,
        postId,
        '2025-01-01',
        '2025-01-31',
      );

      expect(
        mockPostAnalyticsService.getAnalyticsByDateRange,
      ).toHaveBeenCalledWith(
        postId,
        new Date('2025-01-01'),
        new Date('2025-01-31'),
      );
      expect(result).toBeDefined();
    });
  });

  describe('refreshAnalytics', () => {
    const postId = '507f1f77bcf86cd799439014';

    it('should refresh analytics for a post', async () => {
      mockPostsService.findOne.mockResolvedValue(mockPost);
      mockCredentialsService.findOne.mockResolvedValue(mockCredential);
      mockPostAnalyticsService.getPostAnalyticsSummary.mockResolvedValue(
        mockAnalyticsSummary,
      );

      const result = await controller.refreshAnalytics(mockUser, postId);

      expect(mockPostsService.findOne).toHaveBeenCalled();
      expect(mockCredentialsService.findOne).toHaveBeenCalled();
      expect(mockPostAnalyticsService.trackPostAnalytics).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.data?.type).toBe('post-analytics');
    });

    it('should return not found when post does not exist', async () => {
      mockPostsService.findOne.mockResolvedValue(null);

      const result = await controller.refreshAnalytics(mockUser, postId);

      expect(result).toHaveProperty('statusCode', 404);
    });

    it('keeps the credential lookup scoped to the brand and organization', async () => {
      mockPostsService.findOne.mockResolvedValue(mockPost);
      mockCredentialsService.findOne.mockResolvedValue(mockCredential);
      mockPostAnalyticsService.getPostAnalyticsSummary.mockResolvedValue(
        mockAnalyticsSummary,
      );

      await controller.refreshAnalytics(mockUser, postId);

      // Exact match: an extra/missing key here is the whole defect. Filter
      // values of `undefined` are dropped by `normalizeWhere`, so a lookup
      // built from unpopulated relation aliases silently loses its tenant
      // scoping and can return another organization's credential.
      expect(mockCredentialsService.findOne).toHaveBeenCalledWith({
        _id: '507f1f77bcf86cd799439016',
        brandId: '507f1f77bcf86cd799439013',
        organizationId: '507f1f77bcf86cd799439012',
      });
    });

    it('resolves scalar foreign keys ahead of populated relation objects', async () => {
      mockPostsService.findOne.mockResolvedValue({
        ...mockPost,
        // What the row actually looks like when the relations are included.
        brand: { id: '507f1f77bcf86cd799439013', label: 'Acme' },
        brandId: '507f1f77bcf86cd799439013',
        credentialId: '507f1f77bcf86cd799439016',
        organization: { id: '507f1f77bcf86cd799439012' },
        organizationId: '507f1f77bcf86cd799439012',
      });
      mockCredentialsService.findOne.mockResolvedValue(mockCredential);
      mockPostAnalyticsService.getPostAnalyticsSummary.mockResolvedValue(
        mockAnalyticsSummary,
      );

      await controller.refreshAnalytics(mockUser, postId);

      expect(mockCredentialsService.findOne).toHaveBeenCalledWith({
        _id: '507f1f77bcf86cd799439016',
        brandId: '507f1f77bcf86cd799439013',
        organizationId: '507f1f77bcf86cd799439012',
      });
    });

    it('fails closed instead of querying unscoped when the organization is unresolvable', async () => {
      mockPostsService.findOne.mockResolvedValue({
        _id: '507f1f77bcf86cd799439014',
        brandId: '507f1f77bcf86cd799439013',
        credentialId: '507f1f77bcf86cd799439016',
        isDeleted: false,
      });

      await expect(
        controller.refreshAnalytics(mockUser, postId),
      ).rejects.toThrow(/organization/);

      expect(mockCredentialsService.findOne).not.toHaveBeenCalled();
      expect(
        mockPostAnalyticsService.trackPostAnalytics,
      ).not.toHaveBeenCalled();
    });
  });
});
