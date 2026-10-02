import { PostsController } from '@api/collections/posts/controllers/posts.controller';
import { PostsModule } from '@api/collections/posts/posts.module';
import { BaseQueryNormalizationAdapter } from '@api/shared/services/base/base-query-normalization.adapter';
import { MemberRole } from '@genfeedai/contracts';
import { Controller, type ExecutionContext, Get } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import type { Request } from 'express';
import supertest from 'supertest';

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
    platform: 'twitter',
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
    getPublicationInsights: vi
      .fn()
      .mockResolvedValue({ docs: [], totalDocs: 0 }),
    findPublicationInsightById: vi.fn().mockResolvedValue(null),
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

  it('uses explicit selected brand and exact canonical tenant rather than user ownership OR', async () => {
    mockPostsService.findOne.mockResolvedValue(null);
    const selected = testId('selected-brand');
    await controller.getAnalytics(mockUser, testId('post'), {
      brandId: selected,
    });
    expect(mockPostsService.findOne).toHaveBeenCalledWith({
      id: testId('post'),
      organizationId: mockUser.organizationId,
      brandId: selected,
      isDeleted: false,
      brand: {
        is: { organizationId: mockUser.organizationId, isDeleted: false },
      },
    });
    expect(
      mockPostAnalyticsService.getPostAnalyticsSummary,
    ).not.toHaveBeenCalled();
  });
  it('retains the explicit active-brand relation through the real query adapter', () => {
    const filter = {
      id: testId('post'),
      organizationId: mockUser.organizationId,
      brandId: testId('selected-brand'),
      isDeleted: false,
      brand: {
        is: { organizationId: mockUser.organizationId, isDeleted: false },
      },
    };
    expect(
      new BaseQueryNormalizationAdapter('post').normalizeWhere(filter),
    ).toEqual(filter);
  });
  it.each(['getAnalytics', 'refreshAnalytics'] as const)(
    'keeps selected-brand 404 fences for %s',
    async (method) => {
      mockPostsService.findOne.mockResolvedValue(null);
      const selected = testId('selected-brand');
      const result = await controller[method](mockUser, testId('post'), {
        brandId: selected,
      });
      expect(result).toMatchObject({ statusCode: 404 });
      expect(mockPostsService.findOne).toHaveBeenCalledWith({
        id: testId('post'),
        organizationId: mockUser.organizationId,
        brandId: selected,
        isDeleted: false,
        brand: {
          is: { organizationId: mockUser.organizationId, isDeleted: false },
        },
      });
      expect(
        mockPostAnalyticsService.getPostAnalyticsSummary,
      ).not.toHaveBeenCalled();
      expect(
        mockPostAnalyticsService.getAnalyticsByDateRange,
      ).not.toHaveBeenCalled();
      expect(mockPostsService.getCachedData).not.toHaveBeenCalled();
      expect(mockPostsService.setCachedData).not.toHaveBeenCalled();
      expect(mockCredentialsService.findOne).not.toHaveBeenCalled();
      expect(
        mockAnalyticsSyncWorkflowService.queuePostRefresh,
      ).not.toHaveBeenCalled();
    },
  );
  it('blocks captured ineligible refresh before rate-limit read or queue', async () => {
    mockPostsService.findOne.mockResolvedValue({
      ...mockPost,
      source: 'extension',
      externalId: null,
      targetSettings: {
        extensionCapture: { version: 1, publicationKind: 'reply' },
      },
    });
    await expect(
      controller.refreshAnalytics(mockUser, testId('post')),
    ).rejects.toThrow(/not eligible/);
    expect(mockPostsService.getCachedData).not.toHaveBeenCalled();
    expect(
      mockAnalyticsSyncWorkflowService.queuePostRefresh,
    ).not.toHaveBeenCalled();
  });

  it('allows an eligible private recording through the existing collector workflow', async () => {
    mockPostsService.findOne.mockResolvedValue({
      ...mockPost,
      source: 'extension',
      visibility: 'private',
      externalId: '123',
      targetSettings: {
        extensionCapture: { version: 1, publicationKind: 'post' },
      },
    });
    mockCredentialsService.findOne.mockResolvedValue(mockCredential);
    mockPostAnalyticsService.getPostAnalyticsSummary.mockResolvedValue(
      mockAnalyticsSummary,
    );
    await controller.refreshAnalytics(mockUser, testId('post'));
    expect(
      mockAnalyticsSyncWorkflowService.queuePostRefresh,
    ).toHaveBeenCalledWith({
      organizationId: mockUser.organizationId,
      platform: 'twitter',
      postId: testId('post'),
      userId: mockUser.userId,
    });
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
      ).toHaveBeenCalledWith(postId, mockUser.organizationId);
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

      const result = await controller.getAnalytics(mockUser, postId, {
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      });

      expect(
        mockPostAnalyticsService.getAnalyticsByDateRange,
      ).toHaveBeenCalledWith(
        postId,
        new Date('2025-01-01'),
        new Date('2025-01-31'),
        mockUser.organizationId,
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
        isDeleted: false,
        isConnected: true,
        platform: 'TWITTER',
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
        isDeleted: false,
        isConnected: true,
        platform: 'TWITTER',
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

@Controller('posts')
class PublicationFixtureCatchAllController {
  @Get(':id') catchAll() {
    return { wrongRoute: true };
  }
}
describe('publication insights actual HTTP route boundary', () => {
  it('registers before inherited :id with real validation and read-role enforcement', async () => {
    const order = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      PostsModule,
    ) as unknown[];
    expect(order.indexOf(PostsAnalyticsController)).toBeLessThan(
      order.indexOf(PostsController),
    );
    const getPublicationInsights = vi
      .fn()
      .mockResolvedValue({ docs: [{ id: 'insight' }], totalDocs: 1 });
    const findPublicationInsightById = vi
      .fn()
      .mockResolvedValue({ id: 'insight' });
    const module = await Test.createTestingModule({
      controllers: [
        PostsAnalyticsController,
        PublicationFixtureCatchAllController,
      ],
      providers: [
        {
          provide: PostsService,
          useValue: { getPublicationInsights, findPublicationInsightById },
        },
        { provide: CredentialsService, useValue: {} },
        { provide: PostAnalyticsService, useValue: {} },
        { provide: AnalyticsSyncWorkflowService, useValue: {} },
        {
          provide: LoggerService,
          useValue: {
            log: vi.fn(),
            debug: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          const roles = Reflect.getMetadata(
            'roles',
            context.getHandler(),
          ) as string[];
          const req = context.switchToHttp().getRequest<Request>();
          return roles.includes(String(req.headers['x-test-role']));
        },
      })
      .compile();
    const app = module.createNestApplication();
    app.use((req: Request, _res: unknown, next: () => void) => {
      req.user = {
        id: 'legacy-provider',
        userId: testId('user'),
        organizationId: testId('org'),
        brandId: testId('old-brand'),
      };
      next();
    });
    await app.init();
    try {
      const read = (path: string, role: string = MemberRole.OWNER) =>
        supertest(app.getHttpServer()).get(path).set('x-test-role', role);
      const response = await read(
        `/posts/publication-insights?brandId=${testId('brand')}`,
      );
      expect(response.status).toBe(200);
      expect(response.body).toEqual([{ id: 'insight' }]);
      expect(getPublicationInsights).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: testId('brand'),
          page: 1,
          limit: 10,
        }),
        {
          userId: testId('user'),
          organizationId: testId('org'),
          brandId: testId('brand'),
        },
      );
      expect(
        (
          await read(
            `/posts/publication-insights?brandId=${testId('brand')}`,
            'VIEWER',
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await read(
            `/posts/publication-insights?brandId=${testId('brand')}&organizationId=forged`,
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await read(
            `/posts/publication-insights?brandId=${testId('brand')}&source=EXTENSION`,
          )
        ).status,
      ).toBe(400);
      const detail = await read(
        `/posts/${testId('post')}/publication-insights?brandId=${testId('brand')}`,
      );
      expect(detail.status).toBe(200);
      expect(findPublicationInsightById).toHaveBeenCalledWith(testId('post'), {
        userId: testId('user'),
        organizationId: testId('org'),
        brandId: testId('brand'),
      });
    } finally {
      await app.close();
    }
  });
});
