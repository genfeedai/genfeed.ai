import { PostsController } from '@api/collections/posts/controllers/posts.controller';
import { PostsQueryDto } from '@api/collections/posts/dto/posts-query.dto';
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
import { PostSerializer } from '@genfeedai/serializers';
import { readRecord } from '@genfeedai/utils/data/extract.util';
import { ForbiddenException } from '@nestjs/common';

describe('Post detail reads (#6176)', () => {
  const id = 'post-target';
  function setup() {
    const findAll = vi.fn(async (input: unknown) => ({
      ...emptyPage(),
      docs:
        readRecord(readRecord(input).where).organizationId ===
        targetOrganizationId
          ? [{ id, organizationId: targetOrganizationId }]
          : [],
    }));
    const getChildren = vi.fn().mockResolvedValue([]);
    const getPostAnalyticsSummary = vi.fn().mockResolvedValue(null);
    const controller = Object.create(
      PostsController.prototype,
    ) as PostsController;
    Object.assign(controller, {
      serializer: PostSerializer,
      postsService: { findAll, getChildren },
      postAnalyticsService: { getPostAnalyticsSummary },
      loggerService: { warn: vi.fn() },
    });
    return { controller, findAll, getChildren, getPostAnalyticsSummary };
  }
  it('returns 404 for a superadmin foreign row without override', async () => {
    const { controller, findAll, getChildren } = setup();
    await expect(
      controller.findOne(tenantReadRequest(adminUser), adminUser, id),
    ).rejects.toMatchObject({ status: 404 });
    expect(findAll).toHaveBeenCalledWith(
      {
        where: { id, organizationId: sessionOrganizationId, isDeleted: false },
      },
      { pagination: false },
    );
    expect(getChildren).not.toHaveBeenCalled();
  });
  it('reads the post, children and analytics under the matching superadmin override', async () => {
    const { controller, getChildren, getPostAnalyticsSummary } = setup();
    const result = await controller.findOne(
      tenantReadRequest(adminUser),
      adminUser,
      id,
      { organizationId: targetOrganizationId },
    );
    expect(result.data?.id).toBe(id);
    expect(getChildren).toHaveBeenCalledWith(
      id,
      targetOrganizationId,
      expect.any(Array),
    );
    expect(getPostAnalyticsSummary).toHaveBeenCalledWith(
      id,
      targetOrganizationId,
    );
  });
  it('returns 404 for a member foreign row without override', async () => {
    const { controller } = setup();
    await expect(
      controller.findOne(tenantReadRequest(), memberUser, id),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('rejects a member foreign override before reading', async () => {
    const { controller, findAll } = setup();
    await expect(
      controller.findOne(tenantReadRequest(), memberUser, id, {
        organizationId: targetOrganizationId,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(findAll).not.toHaveBeenCalled();
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
      const attachToPage = vi.fn().mockResolvedValue(page);
      const controller = Object.assign(
        Object.create(PostsController.prototype) as PostsController,
        { postsService: { findAll }, evaluationProjection: { attachToPage } },
      );
      const query = tenantReadQuery(PostsQueryDto, { organizationId, brandId });
      await controller.findAll(
        tenantReadRequest(adminUser, query),
        adminUser,
        query,
      );
      expect(attachToPage).toHaveBeenCalledWith(page, {
        brandId: expectedBrandId,
        contentType: 'post',
      });
    },
  );
});
