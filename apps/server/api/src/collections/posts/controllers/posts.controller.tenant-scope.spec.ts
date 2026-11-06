import { AccountHealthService } from '@api/collections/credentials/services/account-health.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ContentEvaluationProjectionService } from '@api/collections/evaluations/services/content-evaluation-projection.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { PostsController } from '@api/collections/posts/controllers/posts.controller';
import { PostsQueryDto } from '@api/collections/posts/dto/posts-query.dto';
import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { QuotaService } from '@api/services/quota/quota.service';
import {
  adminUser,
  emptyPage,
  memberUser,
  sessionBrandId,
  sessionOrganizationId,
  targetBrandId,
  targetOrganizationId,
  tenantReadQuery,
  tenantReadRequest,
} from '@api-test/helpers/tenant-read.fixture';
import { readRecord } from '@genfeedai/utils/data/extract.util';
import { LoggerService } from '@libs/logger/logger.service';
import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

async function setupController(
  postsService: {
    findAll: ReturnType<typeof vi.fn>;
    getChildren?: ReturnType<typeof vi.fn>;
  },
  postAnalyticsService: {
    getPostAnalyticsSummary?: ReturnType<typeof vi.fn>;
  } = {},
  evaluationProjection: {
    attachToItem?: ReturnType<typeof vi.fn>;
    attachToPage?: ReturnType<typeof vi.fn>;
  } = {
    attachToItem: vi.fn(async (item: unknown) => item),
    attachToPage: vi.fn(async (page: unknown) => page),
  },
) {
  const module = await Test.createTestingModule({
    controllers: [PostsController],
    providers: [
      { provide: ActivityRecorderService, useValue: {} },
      { provide: AccountHealthService, useValue: {} },
      { provide: CredentialsService, useValue: {} },
      { provide: IngredientsService, useValue: {} },
      { provide: QuotaService, useValue: {} },
      { provide: PostAnalyticsService, useValue: postAnalyticsService },
      { provide: PostsService, useValue: postsService },
      {
        provide: ContentEvaluationProjectionService,
        useValue: evaluationProjection,
      },
      {
        provide: LoggerService,
        useValue: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
      },
    ],
  })
    .overrideGuard(RolesGuard)
    .useValue({ canActivate: () => true })
    .compile();
  return module.get<PostsController>(PostsController);
}

describe('Post detail reads (#6176)', () => {
  const id = 'post-target';
  // The post, its thread reply and its metrics live in the target organization.
  async function setup() {
    const reads: unknown[] = [];
    const findAll = vi.fn(async (input: unknown, options: unknown) => {
      reads.push([input, options]);
      return {
        ...emptyPage(),
        docs:
          readRecord(readRecord(input).where).organizationId ===
          targetOrganizationId
            ? [{ id, organizationId: targetOrganizationId }]
            : [],
      };
    });
    const getChildren = vi.fn(
      async (parentId: string, organizationId: string) =>
        parentId === id && organizationId === targetOrganizationId
          ? [{ id: 'reply-1', organizationId }]
          : [],
    );
    const getPostAnalyticsSummary = vi.fn(
      async (postId: string, organizationId: string) =>
        postId === id && organizationId === targetOrganizationId
          ? { totalLikes: 7, totalViews: 120 }
          : null,
    );
    const controller = await setupController(
      { findAll, getChildren },
      { getPostAnalyticsSummary },
    );
    return { controller, reads };
  }
  it('returns 404 for a superadmin foreign row without override', async () => {
    const { controller, reads } = await setup();
    await expect(
      controller.findOne(tenantReadRequest(adminUser), adminUser, id),
    ).rejects.toMatchObject({ status: 404 });
    expect(reads).toEqual([
      [
        expect.objectContaining({
          where: {
            id,
            organizationId: sessionOrganizationId,
            isDeleted: false,
          },
        }),
        { pagination: false },
      ],
    ]);
  });
  it('reads the post, children and analytics under the matching superadmin override', async () => {
    const { controller } = await setup();
    const result = await controller.findOne(
      tenantReadRequest(adminUser),
      adminUser,
      id,
      { organizationId: targetOrganizationId },
    );
    expect(result.data?.id).toBe(id);
    expect(JSON.stringify(result)).toContain('reply-1');
    expect(result.data?.attributes).toMatchObject({
      totalLikes: 7,
      totalViews: 120,
    });
  });
  it('returns 404 for a member foreign row without override', async () => {
    const { controller } = await setup();
    await expect(
      controller.findOne(tenantReadRequest(), memberUser, id),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('rejects a member foreign override before reading', async () => {
    const { controller, reads } = await setup();
    await expect(
      controller.findOne(tenantReadRequest(), memberUser, id, {
        organizationId: targetOrganizationId,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(reads).toEqual([]);
  });
});

describe('Post list evaluation brands (#6176)', () => {
  it.each([
    {
      organizationId: targetOrganizationId,
      brandId: targetBrandId,
      expectedBrandId: targetBrandId,
    },
    {
      organizationId: targetOrganizationId,
      brandId: undefined,
      expectedBrandId: undefined,
    },
    {
      organizationId: sessionOrganizationId,
      brandId: undefined,
      expectedBrandId: sessionBrandId,
    },
  ])(
    'projects evaluations using the effective brand ($expectedBrandId)',
    async ({ organizationId, brandId, expectedBrandId }) => {
      const page = emptyPage();
      const findAll = vi.fn().mockResolvedValue(page);
      const projections: unknown[] = [];
      const attachToPage = vi.fn(async (input: unknown, scope: unknown) => {
        projections.push([input, scope]);
        return input;
      });
      const controller = await setupController(
        { findAll },
        {},
        { attachToPage },
      );
      const query = tenantReadQuery(PostsQueryDto, { organizationId, brandId });
      await controller.findAll(
        tenantReadRequest(adminUser, query),
        adminUser,
        query,
      );
      expect(projections).toEqual([
        [page, { brandId: expectedBrandId, contentType: 'post' }],
      ]);
    },
  );
});
