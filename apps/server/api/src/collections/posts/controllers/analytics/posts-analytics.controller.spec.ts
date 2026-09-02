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
import { AnalyticsSyncWorkflowService } from '@api/collections/workflows/services/analytics-sync-workflow.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('PostsAnalyticsController', () => {
  let controller: PostsAnalyticsController;

  const mockUser = {
    id: 'user_123',
    brandId: testId('brand'),
    organizationId: testId('org'),
    userId: testId('user'),
  } as unknown as User;

  const mockPost = {
    id: testId('post'),
    brandId: testId('brand'),
    credentialId: testId('credential'),
    isDeleted: false,
    organizationId: testId('org'),
    userId: testId('user'),
  };

  const mockCredential = {
    id: testId('credential'),
    isConnected: true,
    organizationId: testId('org'),
    platform: 'twitter',
  };

  const mockAnalyticsSummary = {
    comments: 10,
    likes: 100,
    postId: testId('post'),
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
  };

  const mockCredentialsService = {
    findOne: vi.fn(),
  };

  const mockAnalyticsSyncWorkflowService = {
    queueOrganizationRefresh: vi.fn().mockResolvedValue({
      jobId: 'organization-workflow-job',
      workflowId: 'analytics.organization-refresh',
    }),
    queuePostRefresh: vi.fn().mockResolvedValue({
      jobId: 'post-workflow-job',
      workflowId: 'analytics.post-refresh',
    }),
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
          provide: AnalyticsSyncWorkflowService,
          useValue: mockAnalyticsSyncWorkflowService,
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
    const postId = testId('post');

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
    const postId = testId('post');

    it('should refresh analytics for a post', async () => {
      mockPostsService.findOne.mockResolvedValue(mockPost);
      mockCredentialsService.findOne.mockResolvedValue(mockCredential);
      mockPostAnalyticsService.getPostAnalyticsSummary.mockResolvedValue(
        mockAnalyticsSummary,
      );

      const result = await controller.refreshAnalytics(mockUser, postId);

      expect(mockPostsService.findOne).toHaveBeenCalled();
      expect(mockCredentialsService.findOne).toHaveBeenCalled();
      expect(
        mockAnalyticsSyncWorkflowService.queuePostRefresh,
      ).toHaveBeenCalledWith({
        organizationId: testId('org'),
        platform: 'twitter',
        postId,
        userId: testId('user'),
      });
      expect(result).toBeDefined();
      expect(result.data?.type).toBe('post-analytics');
      expect(result.data?.attributes).toEqual(
        expect.objectContaining({
          workflowJobId: 'post-workflow-job',
          workflowId: 'analytics.post-refresh',
        }),
      );
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
        id: testId('credential'),
        brandId: testId('brand'),
        organizationId: testId('org'),
      });
    });

    it('uses canonical scalar foreign keys for the credential lookup', async () => {
      mockPostsService.findOne.mockResolvedValue({
        ...mockPost,
        brandId: testId('brand'),
        credentialId: testId('credential'),
        organizationId: testId('org'),
      });
      mockCredentialsService.findOne.mockResolvedValue(mockCredential);
      mockPostAnalyticsService.getPostAnalyticsSummary.mockResolvedValue(
        mockAnalyticsSummary,
      );

      await controller.refreshAnalytics(mockUser, postId);

      expect(mockCredentialsService.findOne).toHaveBeenCalledWith({
        id: testId('credential'),
        brandId: testId('brand'),
        organizationId: testId('org'),
      });
    });

    it('fails closed instead of querying unscoped when the organization is unresolvable', async () => {
      mockPostsService.findOne.mockResolvedValue({
        id: testId('post'),
        brandId: testId('brand'),
        credentialId: testId('credential'),
        isDeleted: false,
      });

      await expect(
        controller.refreshAnalytics(mockUser, postId),
      ).rejects.toThrow(/organization/);

      expect(mockCredentialsService.findOne).not.toHaveBeenCalled();
      expect(
        mockAnalyticsSyncWorkflowService.queuePostRefresh,
      ).not.toHaveBeenCalled();
    });
  });

  describe('refreshAllAnalytics', () => {
    it('enqueues a keyset-paged org refresh instead of loading every post', async () => {
      const result = await controller.refreshAllAnalytics(mockUser);

      expect(
        mockAnalyticsSyncWorkflowService.queueOrganizationRefresh,
      ).toHaveBeenCalledWith({
        organizationId: testId('org'),
        userId: testId('user'),
      });
      expect(mockPostsService.findAll).not.toHaveBeenCalled();
      expect(result.data?.attributes).toEqual({
        errorCount: 0,
        lastRefreshed: expect.any(Date),
        successCount: 0,
        totalPosts: 0,
        workflowJobId: 'organization-workflow-job',
        workflowId: 'analytics.organization-refresh',
      });
    });
  });
});
