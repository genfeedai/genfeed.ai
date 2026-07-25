import { PostsService } from '@api/collections/posts/services/posts.service';
import type { PublishApprovalsService } from '@api/collections/publish-approvals/services/publish-approvals.service';
import type { CacheService } from '@api/services/cache/services/cache.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';

// Real, schema-derived getModelMeta/PRISMA_MODEL_METADATA.Post plus real enum
// value objects, so `normalizeData` resolves `category` as a genuine Prisma
// enum without pulling in PrismaClient. Same pattern as the ingredients spec.
vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

describe('PostsService batchSchedule', () => {
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  function makeService() {
    const post = {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(({ where }: { where: { id: string } }) => ({
        kind: 'update',
        postId: where.id,
      })),
      updateMany: vi.fn(({ where }: { where: { parentId: string } }) => ({
        kind: 'cascade',
        parentId: where.parentId,
      })),
    };
    const $transaction = vi.fn((writes: unknown[]) => Promise.resolve(writes));
    const cacheService = { invalidateByTags: vi.fn() };
    const publishApprovalsService = {
      assertPostMutable: vi.fn(),
      invalidatePost: vi.fn(),
    };

    return {
      $transaction,
      cacheService,
      post,
      publishApprovalsService,
      service: new PostsService(
        { $transaction, post } as unknown as PrismaService,
        logger as unknown as LoggerService,
        cacheService as unknown as CacheService,
        undefined,
        undefined,
        undefined,
        publishApprovalsService as unknown as PublishApprovalsService,
      ),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips the database entirely for an empty batch', async () => {
    const { $transaction, post, service } = makeService();

    const result = await service.batchSchedule([], 'org-1');

    expect(result).toEqual({ missingPostIds: [], posts: [] });
    expect(post.findMany).not.toHaveBeenCalled();
    expect($transaction).not.toHaveBeenCalled();
  });

  it('resolves the whole batch with one scoped read and one transaction', async () => {
    const { $transaction, post, service } = makeService();
    post.findMany.mockResolvedValue([
      { id: 'post-1', parentId: 'parent-1', publishApprovalId: null },
      { id: 'post-2', parentId: 'parent-1', publishApprovalId: null },
    ]);

    await service.batchSchedule(
      [
        {
          postId: 'post-1',
          scheduledDate: '2026-11-27T14:30:00Z',
          text: 'First',
        },
        {
          postId: 'post-2',
          scheduledDate: '2026-11-28T14:30:00Z',
          text: 'Second',
        },
      ],
      'org-1',
    );

    expect(post.findMany).toHaveBeenCalledTimes(1);
    expect(post.findMany).toHaveBeenCalledWith({
      select: { id: true, parentId: true, publishApprovalId: true },
      where: {
        id: { in: ['post-1', 'post-2'] },
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect($transaction).toHaveBeenCalledTimes(1);
    expect(post.update).toHaveBeenCalledTimes(2);
    expect($transaction.mock.calls[0]?.[0]).toHaveLength(2);
  });

  it('reports posts outside the organization as missing and never writes them', async () => {
    const { post, service } = makeService();
    post.findMany.mockResolvedValue([
      { id: 'post-1', parentId: 'parent-1', publishApprovalId: null },
    ]);

    const result = await service.batchSchedule(
      [
        {
          postId: 'post-1',
          scheduledDate: '2026-11-27T14:30:00Z',
          text: 'Mine',
        },
        {
          postId: 'post-foreign',
          scheduledDate: '2026-11-27T14:30:00Z',
          text: 'Not mine',
        },
      ],
      'org-1',
    );

    expect(result.missingPostIds).toEqual(['post-foreign']);
    expect(post.update).toHaveBeenCalledTimes(1);
    expect(post.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'post-1' } }),
    );
  });

  it('does not open a transaction when every requested post is missing', async () => {
    const { $transaction, cacheService, post, service } = makeService();
    post.findMany.mockResolvedValue([]);

    const result = await service.batchSchedule(
      [
        {
          postId: 'post-foreign',
          scheduledDate: '2026-11-27T14:30:00Z',
          text: 'Not mine',
        },
      ],
      'org-1',
    );

    expect($transaction).not.toHaveBeenCalled();
    expect(cacheService.invalidateByTags).not.toHaveBeenCalled();
    expect(result).toEqual({ missingPostIds: ['post-foreign'], posts: [] });
  });

  it('queues each root post cascade immediately before its own update', async () => {
    const { $transaction, service, post } = makeService();
    post.findMany.mockResolvedValue([
      { id: 'root-1', parentId: null, publishApprovalId: null },
      { id: 'child-1', parentId: 'root-1', publishApprovalId: null },
    ]);

    await service.batchSchedule(
      [
        {
          postId: 'root-1',
          scheduledDate: '2026-11-27T14:30:00Z',
          text: 'Root',
        },
        {
          postId: 'child-1',
          scheduledDate: '2026-11-27T15:30:00Z',
          text: 'Child',
        },
      ],
      'org-1',
    );

    expect(post.updateMany).toHaveBeenCalledTimes(1);
    expect(post.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isDeleted: false,
          parentId: 'root-1',
        }),
      }),
    );
    expect($transaction.mock.calls[0]?.[0]).toEqual([
      { kind: 'cascade', parentId: 'root-1' },
      { kind: 'update', postId: 'root-1' },
      { kind: 'update', postId: 'child-1' },
    ]);
  });

  it('sends ingredients as a relation payload rather than a bare id array', async () => {
    const { post, service } = makeService();
    post.findMany.mockResolvedValue([
      { id: 'post-1', parentId: 'parent-1', publishApprovalId: null },
    ]);

    await service.batchSchedule(
      [
        {
          ingredientIds: ['ing-1', 'ing-2'],
          postId: 'post-1',
          scheduledDate: '2026-11-27T14:30:00Z',
          text: 'With ingredients',
        },
      ],
      'org-1',
    );

    expect(post.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ingredients: { set: [{ id: 'ing-1' }, { id: 'ing-2' }] },
        }),
        include: { credential: true, ingredients: true },
      }),
    );
  });

  it('invalidates the collection cache tags exactly once for the batch', async () => {
    const { cacheService, post, service } = makeService();
    post.findMany.mockResolvedValue([
      { id: 'post-1', parentId: 'parent-1', publishApprovalId: null },
      { id: 'post-2', parentId: 'parent-1', publishApprovalId: null },
    ]);

    await service.batchSchedule(
      [
        {
          postId: 'post-1',
          scheduledDate: '2026-11-27T14:30:00Z',
          text: 'First',
        },
        {
          postId: 'post-2',
          scheduledDate: '2026-11-28T14:30:00Z',
          text: 'Second',
        },
      ],
      'org-1',
    );

    expect(cacheService.invalidateByTags).toHaveBeenCalledTimes(1);
    expect(cacheService.invalidateByTags).toHaveBeenCalledWith([
      'post',
      'collection:post',
      'agg:post',
      'agg:paginated',
    ]);
  });

  it('asserts mutability before writing and invalidates approvals afterwards', async () => {
    const { post, publishApprovalsService, service } = makeService();
    post.findMany.mockResolvedValue([
      { id: 'post-1', parentId: 'parent-1', publishApprovalId: 'approval-1' },
    ]);

    await service.batchSchedule(
      [
        {
          postId: 'post-1',
          scheduledDate: '2026-11-27T14:30:00Z',
          text: 'Approved',
        },
      ],
      'org-1',
    );

    expect(publishApprovalsService.assertPostMutable).toHaveBeenCalledTimes(1);
    expect(publishApprovalsService.assertPostMutable).toHaveBeenCalledWith(
      'org-1',
      'post-1',
    );
    expect(publishApprovalsService.invalidatePost).toHaveBeenCalledTimes(1);
    expect(publishApprovalsService.invalidatePost).toHaveBeenCalledWith(
      'org-1',
      'post-1',
      expect.any(String),
    );
  });

  it('never writes when an approval guard rejects the batch', async () => {
    const { $transaction, post, publishApprovalsService, service } =
      makeService();
    post.findMany.mockResolvedValue([
      { id: 'post-1', parentId: 'parent-1', publishApprovalId: 'approval-1' },
    ]);
    publishApprovalsService.assertPostMutable.mockRejectedValue(
      new Error('Post is locked by an approval'),
    );

    await expect(
      service.batchSchedule(
        [
          {
            postId: 'post-1',
            scheduledDate: '2026-11-27T14:30:00Z',
            text: 'Approved',
          },
        ],
        'org-1',
      ),
    ).rejects.toThrow('Post is locked by an approval');
    expect($transaction).not.toHaveBeenCalled();
  });
});
