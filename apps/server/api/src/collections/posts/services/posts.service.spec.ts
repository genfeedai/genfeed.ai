import { PostsService } from '@api/collections/posts/services/posts.service';
import type { PublishApprovalsService } from '@api/collections/publish-approvals/services/publish-approvals.service';
import type { CacheService } from '@api/services/cache/services/cache.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CredentialPlatform, PostStatus } from '@genfeedai/enums';
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
  const publishTarget = {
    credentialId: 'credential-1',
    platform: CredentialPlatform.TWITTER,
  };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  function makeService() {
    const credential = {
      findFirst: vi.fn(),
    };
    const post = {
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => ({
        ...data,
        id: 'post-created',
      })),
      findFirst: vi.fn(),
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
      credential,
      post,
      publishApprovalsService,
      service: new PostsService(
        { $transaction, credential, post } as unknown as PrismaService,
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

  it('writes canonical scalar IDs and converts public arrays to Prisma relations', async () => {
    const { post, service } = makeService();

    await service.create(
      {
        brandId: 'brand-1',
        agentContextSource: 'thread',
        agentContextVersion: 3,
        agentRunId: 'agent-run-1',
        agentStrategyId: 'strategy-1',
        agentThreadId: 'thread-1',
        credentialId: 'credential-1',
        description: 'Canonical post',
        ingredients: ['ingredient-1', 'ingredient-2'],
        label: 'Canonical post',
        organizationId: 'org-1',
        parentId: 'parent-1',
        platform: CredentialPlatform.TWITTER,
        promptUsed: 'Write a concise launch post',
        reviewBatchId: 'review-batch-1',
        reviewItemId: 'review-item-1',
        sourceActionId: 'action-1',
        sourceWorkflowId: 'workflow-1',
        sourceWorkflowName: 'Launch workflow',
        status: PostStatus.DRAFT,
        tags: ['tag-1'],
        userId: 'user-1',
      },
      [],
    );

    const writeData = post.create.mock.calls[0]?.[0].data;
    expect(writeData).toMatchObject({
      brandId: 'brand-1',
      agentContextSource: 'thread',
      agentContextVersion: 3,
      agentRunId: 'agent-run-1',
      agentStrategyId: 'strategy-1',
      agentThreadId: 'thread-1',
      credentialId: 'credential-1',
      ingredients: {
        connect: [{ id: 'ingredient-1' }, { id: 'ingredient-2' }],
      },
      organizationId: 'org-1',
      parentId: 'parent-1',
      promptUsed: 'Write a concise launch post',
      reviewBatchId: 'review-batch-1',
      reviewItemId: 'review-item-1',
      sourceActionId: 'action-1',
      sourceWorkflowId: 'workflow-1',
      sourceWorkflowName: 'Launch workflow',
      tags: { connect: [{ id: 'tag-1' }] },
      userId: 'user-1',
    });
    expect(writeData).not.toHaveProperty('brand');
    expect(writeData).not.toHaveProperty('credential');
    expect(writeData).not.toHaveProperty('organization');
    expect(writeData).not.toHaveProperty('parent');
    expect(writeData).not.toHaveProperty('user');
  });

  it('creates threads from canonical inputs and owns the parentId linkage', async () => {
    const { post, service } = makeService();
    post.create
      .mockImplementationOnce(
        ({ data }: { data: Record<string, unknown> }) => ({
          ...data,
          id: 'root-post',
        }),
      )
      .mockImplementationOnce(
        ({ data }: { data: Record<string, unknown> }) => ({
          ...data,
          id: 'child-post',
        }),
      );

    await service.createThread(
      [
        {
          brandId: 'brand-1',
          credentialId: 'credential-1',
          description: 'Root',
          ingredients: [],
          label: 'Root',
          organizationId: 'org-1',
          parentId: 'ignored-parent',
          platform: CredentialPlatform.TWITTER,
          status: PostStatus.DRAFT,
          userId: 'user-1',
        },
        {
          brandId: 'brand-1',
          credentialId: 'credential-1',
          description: 'Child',
          ingredients: [],
          label: 'Child',
          organizationId: 'org-1',
          parentId: 'ignored-parent',
          platform: CredentialPlatform.TWITTER,
          status: PostStatus.DRAFT,
          userId: 'user-1',
        },
      ],
      [],
    );

    const rootWrite = post.create.mock.calls[0]?.[0].data;
    const childWrite = post.create.mock.calls[1]?.[0].data;
    expect(rootWrite).not.toHaveProperty('parentId');
    expect(childWrite).toMatchObject({ order: 1, parentId: 'root-post' });
  });

  it('allows an untargeted draft before an account is selected', async () => {
    const { post, service } = makeService();

    await service.create(
      {
        brandId: 'brand-1',
        description: 'Draft awaiting account selection',
        ingredients: [],
        label: 'Untargeted draft',
        organizationId: 'org-1',
        status: PostStatus.DRAFT,
        userId: 'user-1',
      },
      [],
    );

    expect(post.create.mock.calls[0]?.[0].data).not.toHaveProperty(
      'credentialId',
    );
  });

  it('rejects scheduling until an account and platform are selected', async () => {
    const { post, service } = makeService();

    expect(() =>
      service.create(
        {
          brandId: 'brand-1',
          description: 'Cannot schedule yet',
          ingredients: [],
          label: 'Untargeted scheduled post',
          organizationId: 'org-1',
          status: PostStatus.SCHEDULED,
          userId: 'user-1',
        },
        [],
      ),
    ).toThrow(
      'A credential and platform are required before scheduling or publishing a post.',
    );
    expect(post.create).not.toHaveBeenCalled();
  });

  it('derives platform from a changed credential in the post organization', async () => {
    const { credential, post, service } = makeService();
    post.findFirst.mockResolvedValue({
      organizationId: 'org-1',
      publishApprovalId: null,
    });
    credential.findFirst.mockResolvedValue({
      platform: CredentialPlatform.INSTAGRAM,
    });

    await service.patch('post-1', { credentialId: 'credential-2' }, []);

    expect(credential.findFirst).toHaveBeenCalledWith({
      select: { platform: true },
      where: {
        id: 'credential-2',
        isConnected: true,
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(post.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          credentialId: 'credential-2',
          platform: CredentialPlatform.INSTAGRAM,
        }),
      }),
    );
  });

  it('rejects a credential outside the post organization', async () => {
    const { credential, post, service } = makeService();
    post.findFirst.mockResolvedValue({
      organizationId: 'org-1',
      publishApprovalId: null,
    });
    credential.findFirst.mockResolvedValue(null);

    await expect(
      service.patch('post-1', { credentialId: 'credential-foreign' }, []),
    ).rejects.toThrow(
      'The selected publishing credential is unavailable for this organization.',
    );
    expect(post.update).not.toHaveBeenCalled();
  });

  it('keeps thread children on the root publishing target when scheduling', async () => {
    const { credential, post, service } = makeService();
    post.findFirst
      .mockResolvedValueOnce({
        organizationId: 'org-1',
        publishApprovalId: null,
      })
      .mockResolvedValueOnce({
        credentialId: 'credential-1',
        id: 'post-1',
        parentId: null,
        platform: CredentialPlatform.TWITTER,
        status: PostStatus.DRAFT,
      });
    credential.findFirst.mockResolvedValue({
      platform: CredentialPlatform.INSTAGRAM,
    });

    await service.patch(
      'post-1',
      {
        credentialId: 'credential-2',
        scheduledDate: new Date('2026-11-27T14:30:00Z'),
        status: PostStatus.SCHEDULED,
      },
      [],
    );

    expect(post.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          credentialId: 'credential-2',
          platform: CredentialPlatform.INSTAGRAM,
          status: PostStatus.SCHEDULED,
        }),
      }),
    );
  });

  it('skips the database entirely for an empty batch', async () => {
    const { $transaction, post, service } = makeService();

    const result = await service.batchSchedule([], 'org-1', publishTarget);

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
      publishTarget,
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
      publishTarget,
    );

    expect(result.missingPostIds).toEqual(['post-foreign']);
    expect(post.update).toHaveBeenCalledTimes(1);
    expect(post.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'post-1',
          isDeleted: false,
          organizationId: 'org-1',
        },
      }),
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
      publishTarget,
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
      publishTarget,
    );

    expect(post.updateMany).toHaveBeenCalledTimes(1);
    expect(post.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          credentialId: 'credential-1',
          platform: CredentialPlatform.TWITTER,
        }),
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
      publishTarget,
    );

    expect(post.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          credentialId: 'credential-1',
          ingredients: { set: [{ id: 'ing-1' }, { id: 'ing-2' }] },
          platform: CredentialPlatform.TWITTER,
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
      publishTarget,
    );

    expect(cacheService.invalidateByTags).toHaveBeenCalledTimes(1);
    expect(cacheService.invalidateByTags).toHaveBeenCalledWith([
      'post',
      'collection:post',
      'query:post',
      'query:paginated',
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
      publishTarget,
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
        publishTarget,
      ),
    ).rejects.toThrow('Post is locked by an approval');
    expect($transaction).not.toHaveBeenCalled();
  });
});
