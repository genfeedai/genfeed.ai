import { InvalidChannelTargetScheduleException } from '@api/collections/posts/services/channel-target-schedule-validation.util';
import { PostsService } from '@api/collections/posts/services/posts.service';
import type { PublishApprovalsService } from '@api/collections/publish-approvals/services/publish-approvals.service';
import type { CacheService } from '@api/services/cache/cache.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { expectCloudGuardPasses } from '@api/shared/testing/cloud-guard-assertions';
import {
  CredentialPlatform,
  PostCategory,
  PostFormat,
  PostStatus,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';

async function captureChannelTargetError(
  promise: Promise<unknown>,
): Promise<InvalidChannelTargetScheduleException> {
  try {
    await promise;
  } catch (error: unknown) {
    if (error instanceof InvalidChannelTargetScheduleException) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected the promise to reject.');
}

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
    const campaign = {
      findFirst: vi.fn().mockResolvedValue({ id: 'campaign-1' }),
    };
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
      update: vi.fn(
        ({
          data,
          where,
        }: {
          data?: Record<string, unknown>;
          where: { id: string };
        }) => ({
          data,
          kind: 'update',
          postId: where.id,
        }),
      ),
      updateMany: vi.fn(({ where }: { where: { parentId: string } }) => ({
        kind: 'cascade',
        count: 0,
        parentId: where.parentId,
      })),
    };
    const learningDelegates = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'locked' }]),
      contentLearningAccount: { findMany: vi.fn().mockResolvedValue([]) },
      contentLearningDependency: { findMany: vi.fn().mockResolvedValue([]) },
      publishApproval: { findMany: vi.fn().mockResolvedValue([]) },
      contentVersionPin: { findMany: vi.fn().mockResolvedValue([]) },
      postPublishFinalization: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const $transaction = vi.fn(
      (writes: unknown[] | ((tx: unknown) => Promise<unknown>)) =>
        typeof writes === 'function'
          ? writes({ ...learningDelegates, post, credential })
          : Promise.resolve(writes),
    );
    const cacheService = { invalidateByTags: vi.fn() };
    const publishApprovalsService = {
      assertPostMutable: vi.fn(),
      createForCurrentPost: vi.fn().mockResolvedValue({
        artifactVersionPinId: 'pin-1',
        id: 'approval-1',
        operationId: 'op-1',
      }),
      invalidatePost: vi.fn(),
      markQueued: vi.fn(),
    };
    const postPublishQueueService = {
      enqueue: vi.fn(),
    };

    return {
      $transaction,
      cacheService,
      campaign,
      credential,
      post,
      postPublishQueueService,
      publishApprovalsService,
      service: new PostsService(
        {
          $transaction,
          campaign,
          credential,
          ingredient: { findMany: vi.fn().mockResolvedValue([]) },
          post,
        } as unknown as PrismaService,
        logger as unknown as LoggerService,
        { completeMissions: vi.fn().mockResolvedValue([]) } as never,
        cacheService as unknown as CacheService,
        undefined,
        publishApprovalsService as unknown as PublishApprovalsService,
        postPublishQueueService as never,
      ),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves persisted and populated post values at direct-read boundaries', async () => {
    const { post, service } = makeService();
    const createdAt = new Date('2026-09-01T10:00:00Z');
    const ingredients = [{ id: 'ingredient-1' }];
    const row = {
      createdAt,
      credentialId: null,
      id: 'post-1',
      ingredients,
      organizationId: 'org-1',
      platform: null,
    };
    post.findMany.mockResolvedValue([row]);

    const found = await service.findByIds(['post-1'], 'org-1');
    const children = await runWithTenantContext(
      { organizationId: 'org-1' },
      () => service.getChildren('parent-1', 'org-1'),
    );

    expect(found).toEqual([row]);
    expect(children).toEqual([row]);
    expect(post.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          isDeleted: false,
          organizationId: 'org-1',
          parentId: 'parent-1',
        },
      }),
    );
    expectCloudGuardPasses('Post', 'findMany', post.findMany);
    expect(found[0]?.createdAt).toBe(createdAt);
    expect(found[0]?.ingredients).toBe(ingredients);
  });

  it('writes canonical scalar IDs and converts public arrays to Prisma relations', async () => {
    const { post, service } = makeService();
    const parent = {
      id: 'parent-1',
      organizationId: 'org-1',
      brandId: 'brand-1',
      credentialId: 'credential-1',
      parentId: null,
      isDeleted: false,
      ingredients: [],
      _count: { children: 0, ingredients: 0 },
      publishApprovalId: null,
      reviewVersionPinId: null,
      category: PostCategory.TEXT,
      platform: CredentialPlatform.TWITTER,
      targetExecutionState: TargetExecutionState.DRAFT,
      visibility: PostVisibility.PUBLIC,
    };
    post.findFirst.mockImplementation(
      async ({ where }: Prisma.PostFindFirstArgs) =>
        where?.id === parent.id &&
        where.organizationId === parent.organizationId &&
        (where.isDeleted === undefined || where.isDeleted === false)
          ? structuredClone(parent)
          : null,
    );
    post.create.mockImplementation(({ data }) => {
      parent._count.children++;
      return { ...data, id: 'post-created' };
    });

    await service.create(
      {
        brandId: 'brand-1',
        agentContextSource: 'thread',
        agentContextVersion: 3,
        workflowExecutionId: 'agent-run-1',
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
        targetExecutionState: TargetExecutionState.DRAFT,
        tags: ['tag-1'],
        userId: 'user-1',
      },
      [],
    );

    expect(parent._count.children).toBe(1);
    expect(post.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'parent-1', organizationId: 'org-1', isDeleted: false },
      }),
    );
    const writeData = post.create.mock.calls[0]?.[0].data;
    expect(writeData).toMatchObject({
      brandId: 'brand-1',
      agentContextSource: 'thread',
      agentContextVersion: 3,
      workflowExecutionId: 'agent-run-1',
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
      targetExecutionState: TargetExecutionState.DRAFT,
      userId: 'user-1',
      visibility: PostVisibility.PUBLIC,
    });
    expect(writeData).not.toHaveProperty('status');
    expect(writeData).not.toHaveProperty('brand');
    expect(writeData).not.toHaveProperty('credential');
    expect(writeData).not.toHaveProperty('organization');
    expect(writeData).not.toHaveProperty('parent');
    expect(writeData).not.toHaveProperty('user');
  });

  it('stamps campaign membership after validating brand and organization ownership', async () => {
    const { campaign, post, service } = makeService();

    await service.create(
      {
        brandId: 'brand-1',
        campaignId: 'campaign-1',
        credentialId: 'credential-1',
        description: 'Campaign post',
        ingredients: [],
        label: 'Campaign post',
        organizationId: 'org-1',
        platform: CredentialPlatform.TWITTER,
        targetExecutionState: TargetExecutionState.DRAFT,
        userId: 'user-1',
      },
      [],
    );

    expect(campaign.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        brandId: 'brand-1',
        id: 'campaign-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(post.create.mock.calls[0]?.[0].data).toMatchObject({
      campaignId: 'campaign-1',
    });
  });

  it('defaults omitted execution state to draft when no scheduled date is set', async () => {
    const { post, service } = makeService();

    await service.create(
      {
        brandId: 'brand-1',
        credentialId: 'credential-1',
        description: 'Untitled draft',
        ingredients: [],
        label: 'Untitled draft',
        organizationId: 'org-1',
        platform: CredentialPlatform.TWITTER,
        userId: 'user-1',
      },
      [],
    );

    expect(post.create.mock.calls[0]?.[0].data).toMatchObject({
      targetExecutionState: TargetExecutionState.DRAFT,
    });
  });

  it('defaults omitted execution state to scheduled when a date is set', async () => {
    const { post, service } = makeService();

    await service.create(
      {
        brandId: 'brand-1',
        credentialId: 'credential-1',
        description: 'Scheduled later',
        ingredients: [],
        label: 'Scheduled later',
        organizationId: 'org-1',
        platform: CredentialPlatform.TWITTER,
        scheduledDate: new Date('2026-08-20T10:00:00.000Z'),
        userId: 'user-1',
      },
      [],
    );

    expect(post.create.mock.calls[0]?.[0].data).toMatchObject({
      targetExecutionState: TargetExecutionState.SCHEDULED,
    });
  });

  it('creates threads from canonical inputs and owns the parentId linkage', async () => {
    const { post, service } = makeService();
    let root: (Record<string, unknown> & { id: string }) | undefined;
    let children = 0;
    post.findFirst.mockImplementation(async () =>
      root ? { ...root, _count: { children, ingredients: 0 } } : null,
    );
    post.create
      .mockImplementationOnce(({ data }: { data: Record<string, unknown> }) => {
        root = {
          ...data,
          id: 'root-post',
          isDeleted: false,
          parentId: null,
          publishApprovalId: null,
          reviewVersionPinId: null,
        };
        return { ...root, id: 'root-post' };
      })
      .mockImplementationOnce(
        ({ data }: { data: Record<string, unknown> }) => ({
          ...data,
          id: `child-${++children === 1 ? 'post' : children}`,
          isDeleted: false,
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
          targetExecutionState: TargetExecutionState.DRAFT,
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
          targetExecutionState: TargetExecutionState.DRAFT,
          userId: 'user-1',
        },
      ],
      [],
    );

    const rootWrite = post.create.mock.calls[0]?.[0].data;
    const childWrite = post.create.mock.calls[1]?.[0].data;
    expect(rootWrite).toMatchObject({ format: PostFormat.THREAD, order: 0 });
    expect(rootWrite).not.toHaveProperty('parentId');
    expect(childWrite).toMatchObject({
      format: PostFormat.THREAD,
      order: 1,
      parentId: 'root-post',
    });
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
        targetExecutionState: TargetExecutionState.DRAFT,
        userId: 'user-1',
      },
      [],
    );

    expect(post.create.mock.calls[0]?.[0].data).not.toHaveProperty(
      'credentialId',
    );
  });

  it('persists published lifecycle independently from private visibility', async () => {
    const { post, service } = makeService();

    await service.create(
      {
        brandId: 'brand-1',
        credentialId: 'credential-1',
        description: 'Private published video',
        ingredients: [],
        label: 'Private video',
        organizationId: 'org-1',
        platform: CredentialPlatform.YOUTUBE,
        targetExecutionState: TargetExecutionState.PUBLISHED,
        userId: 'user-1',
        visibility: PostVisibility.PRIVATE,
      },
      [],
    );

    expect(post.create.mock.calls[0]?.[0].data).toMatchObject({
      targetExecutionState: TargetExecutionState.PUBLISHED,
      visibility: PostVisibility.PRIVATE,
    });
    expect(post.create.mock.calls[0]?.[0].data).not.toHaveProperty('status');
  });

  it('rejects unsupported visibility before persistence', async () => {
    const { post, service } = makeService();

    await expect(
      service.create(
        {
          brandId: 'brand-1',
          credentialId: 'credential-1',
          description: 'Private Instagram post',
          ingredients: [],
          label: 'Unsupported visibility',
          organizationId: 'org-1',
          platform: CredentialPlatform.INSTAGRAM,
          targetExecutionState: TargetExecutionState.SCHEDULED,
          userId: 'user-1',
          visibility: PostVisibility.PRIVATE,
        },
        [],
      ),
    ).rejects.toThrow('instagram does not support private visibility.');
    expect(post.create).not.toHaveBeenCalled();
  });

  it('rejects scheduling until an account and platform are selected', async () => {
    const { post, service } = makeService();

    await expect(
      service.create(
        {
          brandId: 'brand-1',
          description: 'Cannot schedule yet',
          ingredients: [],
          label: 'Untargeted scheduled post',
          organizationId: 'org-1',
          targetExecutionState: TargetExecutionState.SCHEDULED,
          userId: 'user-1',
        },
        [],
      ),
    ).rejects.toThrow(
      'A credential and platform are required before scheduling or publishing a post.',
    );
    expect(post.create).not.toHaveBeenCalled();
  });

  describe('channel target validation choke point on create (#5193)', () => {
    it('rejects scheduling a text-only post to a video-only platform', async () => {
      const { post, service } = makeService();

      const error = await captureChannelTargetError(
        service.create(
          {
            brandId: 'brand-1',
            category: PostCategory.TEXT,
            credentialId: 'credential-1',
            description: 'No media at all',
            ingredients: [],
            label: 'Text-only',
            organizationId: 'org-1',
            platform: CredentialPlatform.YOUTUBE,
            targetExecutionState: TargetExecutionState.SCHEDULED,
            userId: 'user-1',
          },
          [],
        ),
      );

      expect(error.validation.errors[0]?.code).toBe(
        'channel_target.media_required',
      );
      expect(post.create).not.toHaveBeenCalled();
    });

    it('rejects an image on a video-only platform, not just missing media', async () => {
      const { post, service } = makeService();

      const error = await captureChannelTargetError(
        service.create(
          {
            brandId: 'brand-1',
            category: PostCategory.IMAGE,
            credentialId: 'credential-1',
            description: 'An image, not a video',
            ingredients: ['ingredient-1'],
            label: 'Image on YouTube',
            organizationId: 'org-1',
            platform: CredentialPlatform.YOUTUBE,
            targetExecutionState: TargetExecutionState.SCHEDULED,
            userId: 'user-1',
          },
          [],
        ),
      );

      expect(error.validation.errors[0]?.code).toBe(
        'channel_target.unsupported_media_kind',
      );
      expect(post.create).not.toHaveBeenCalled();
    });

    it('allows scheduling a video to a video-only platform', async () => {
      const { post, service } = makeService();

      await service.create(
        {
          brandId: 'brand-1',
          category: PostCategory.VIDEO,
          credentialId: 'credential-1',
          description: 'A real video',
          ingredients: ['ingredient-1'],
          label: 'Video on YouTube',
          organizationId: 'org-1',
          platform: CredentialPlatform.YOUTUBE,
          targetExecutionState: TargetExecutionState.SCHEDULED,
          userId: 'user-1',
        },
        [],
      );

      expect(post.create).toHaveBeenCalled();
    });
  });

  it('derives platform from a changed credential in the post organization', async () => {
    const { credential, post, service } = makeService();
    post.findFirst.mockResolvedValue({
      id: 'post-1',
      brandId: null,
      credentialId: 'credential-1',
      isDeleted: false,
      parentId: null,
      targetExecutionState: TargetExecutionState.DRAFT,
      visibility: PostVisibility.PUBLIC,
      ingredients: [],
      _count: { children: 0, ingredients: 0 },
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

  it('maps a Prisma SCREAMING credential platform onto posts.platform', async () => {
    const { credential, post, service } = makeService();
    post.findFirst.mockResolvedValue({
      id: 'post-1',
      brandId: null,
      credentialId: 'credential-1',
      isDeleted: false,
      parentId: null,
      targetExecutionState: TargetExecutionState.DRAFT,
      visibility: PostVisibility.PUBLIC,
      ingredients: [],
      _count: { children: 0, ingredients: 0 },
      organizationId: 'org-1',
      publishApprovalId: null,
    });
    credential.findFirst.mockResolvedValue({
      platform: 'TWITTER',
    });

    await service.patch('post-1', { credentialId: 'credential-2' }, []);

    expect(post.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          credentialId: 'credential-2',
          platform: CredentialPlatform.TWITTER,
        }),
      }),
    );
    expect(post.update.mock.calls[0]?.[0]?.data?.platform).toBe('twitter');
  });

  it('refuses to persist an unknown credential platform onto posts.platform', async () => {
    const { credential, post, service } = makeService();
    post.findFirst.mockResolvedValue({
      id: 'post-1',
      brandId: null,
      credentialId: 'credential-1',
      isDeleted: false,
      parentId: null,
      targetExecutionState: TargetExecutionState.DRAFT,
      visibility: PostVisibility.PUBLIC,
      ingredients: [],
      _count: { children: 0, ingredients: 0 },
      organizationId: 'org-1',
      publishApprovalId: null,
    });
    credential.findFirst.mockResolvedValue({
      platform: 'NOT_A_PLATFORM',
    });

    await expect(
      service.patch('post-1', { credentialId: 'credential-2' }, []),
    ).rejects.toThrow('Unknown credential platform: NOT_A_PLATFORM');
    expect(post.update).not.toHaveBeenCalled();
  });

  it('rejects a credential outside the post organization', async () => {
    const { credential, post, service } = makeService();
    post.findFirst.mockResolvedValue({
      id: 'post-1',
      brandId: null,
      credentialId: 'credential-1',
      isDeleted: false,
      parentId: null,
      targetExecutionState: TargetExecutionState.DRAFT,
      visibility: PostVisibility.PUBLIC,
      ingredients: [],
      _count: { children: 0, ingredients: 0 },
      organizationId: 'org-1',
      publishApprovalId: null,
    });
    credential.findFirst.mockResolvedValue(null);

    await expect(
      service.patch('post-1', { credentialId: 'credential-foreign' }, []),
    ).rejects.toThrow(
      'The selected publishing credential is unavailable for this brand.',
    );
    expect(post.update).not.toHaveBeenCalled();
  });

  it('keeps thread children on the root publishing target when scheduling', async () => {
    const { credential, post, service } = makeService();
    post.findFirst.mockResolvedValue({
      brandId: null,
      isDeleted: false,
      targetExecutionState: TargetExecutionState.DRAFT,
      visibility: PostVisibility.PUBLIC,
      _count: { children: 0, ingredients: 0 },
      organizationId: 'org-1',
      publishApprovalId: null,

      category: 'IMAGE',
      credentialId: 'credential-1',
      description: 'Existing caption',
      id: 'post-1',
      ingredients: [{ id: 'ingredient-1' }],
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
        targetExecutionState: TargetExecutionState.SCHEDULED,
      },
      [],
    );

    expect(post.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          credentialId: 'credential-2',
          platform: CredentialPlatform.INSTAGRAM,
          targetExecutionState: TargetExecutionState.SCHEDULED,
        }),
      }),
    );
  });

  describe('re-validates media/credential edits on an already-scheduled post (#5193)', () => {
    // `patch()` writes directly (it never routes through PostLifecycleService),
    // so `findOne` — backed by `post.findFirst`, same as `patch`'s own
    // approval-context read — is this choke point's only source for the
    // current, already-persisted state. The first `findFirst` call is always
    // the approval-context read; the second is `findOne`'s.
    it('rejects swapping the credential to a platform the existing media cannot satisfy', async () => {
      const { credential, post, service } = makeService();
      post.findFirst.mockResolvedValue({
        brandId: null,
        isDeleted: false,
        parentId: null,
        _count: { children: 0, ingredients: 0 },
        publishApprovalId: null,

        category: 'IMAGE',
        credentialId: 'credential-1',
        description: 'Existing caption',
        id: 'post-1',
        ingredients: [{ id: 'ingredient-1' }],
        organizationId: 'org-1',
        platform: CredentialPlatform.INSTAGRAM,
        targetExecutionState: TargetExecutionState.SCHEDULED,
        visibility: PostVisibility.PUBLIC,
      });
      credential.findFirst.mockResolvedValue({
        platform: CredentialPlatform.YOUTUBE,
      });

      const error = await captureChannelTargetError(
        service.patch('post-1', { credentialId: 'credential-youtube' }, []),
      );

      expect(error.validation.errors[0]?.code).toBe(
        'channel_target.unsupported_media_kind',
      );
      expect(post.update).not.toHaveBeenCalled();
    });

    it('re-validates when the caller edits media on an already-scheduled post without touching execution state', async () => {
      const { post, service } = makeService();
      post.findFirst.mockResolvedValue({
        brandId: null,
        isDeleted: false,
        parentId: null,
        _count: { children: 0, ingredients: 0 },
        publishApprovalId: null,

        category: 'VIDEO',
        credentialId: 'credential-1',
        description: 'Existing caption',
        id: 'post-1',
        ingredients: [{ id: 'ingredient-1' }],
        organizationId: 'org-1',
        platform: CredentialPlatform.YOUTUBE,
        targetExecutionState: TargetExecutionState.SCHEDULED,
        visibility: PostVisibility.PUBLIC,
      });

      // Removing the only ingredient leaves this YouTube target with no
      // video at all.
      const error = await captureChannelTargetError(
        service.patch('post-1', { ingredients: [] }, []),
      );

      expect(error.validation.errors[0]?.code).toBe(
        'channel_target.media_required',
      );
      expect(post.update).not.toHaveBeenCalled();
    });

    it('allows a media edit that still satisfies the platform', async () => {
      const { post, service } = makeService();
      post.findFirst.mockResolvedValue({
        brandId: null,
        isDeleted: false,
        parentId: null,
        _count: { children: 0, ingredients: 0 },
        publishApprovalId: null,

        category: 'VIDEO',
        credentialId: 'credential-1',
        description: 'Existing caption',
        id: 'post-1',
        ingredients: [{ id: 'ingredient-1' }],
        organizationId: 'org-1',
        platform: CredentialPlatform.YOUTUBE,
        targetExecutionState: TargetExecutionState.SCHEDULED,
        visibility: PostVisibility.PUBLIC,
      });

      await service.patch('post-1', { ingredients: ['ingredient-2'] }, []);

      expect(post.update).toHaveBeenCalled();
    });

    it('does not re-check a post that is not scheduled', async () => {
      const { post, service } = makeService();
      post.findFirst.mockResolvedValue({
        brandId: null,
        isDeleted: false,
        parentId: null,
        _count: { children: 0, ingredients: 0 },
        publishApprovalId: null,

        category: 'TEXT',
        credentialId: 'credential-1',
        description: 'Draft caption',
        id: 'post-1',
        ingredients: [],
        organizationId: 'org-1',
        platform: CredentialPlatform.YOUTUBE,
        targetExecutionState: TargetExecutionState.DRAFT,
        visibility: PostVisibility.PUBLIC,
      });

      await service.patch('post-1', { description: 'Updated draft' }, []);

      expect(post.update).toHaveBeenCalled();
    });
  });

  it('skips the database entirely for an empty batch', async () => {
    const { $transaction, post, service } = makeService();

    const result = await service.batchSchedule(
      [],
      'org-1',
      publishTarget,
      'user-1',
    );

    expect(result).toEqual({
      invalidTargetPostIds: [],
      missingPostIds: [],
      posts: [],
    });
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
      'user-1',
    );

    expect(post.findMany).toHaveBeenCalledTimes(1);
    expect(post.findMany).toHaveBeenCalledWith({
      select: {
        agentStrategyId: true,
        brandId: true,
        groupId: true,
        category: true,
        id: true,
        parentId: true,
        publishApprovalId: true,
        targetSettings: true,
        visibility: true,
      },
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
      'user-1',
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
      'user-1',
    );

    expect($transaction).not.toHaveBeenCalled();
    expect(cacheService.invalidateByTags).not.toHaveBeenCalled();
    expect(result).toEqual({
      invalidTargetPostIds: [],
      missingPostIds: ['post-foreign'],
      posts: [],
    });
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
      'user-1',
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
      { kind: 'cascade', count: 0, parentId: 'root-1' },
      expect.objectContaining({ kind: 'update', postId: 'root-1' }),
      expect.objectContaining({ kind: 'update', postId: 'child-1' }),
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
      'user-1',
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
      'user-1',
    );

    expect(cacheService.invalidateByTags).toHaveBeenCalledTimes(1);
    expect(cacheService.invalidateByTags).toHaveBeenCalledWith([
      'post',
      'collection:post',
      'query:post',
      'query:paginated:post',
    ]);
  });

  it('asserts mutability before writing a guarded batch', async () => {
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
      'user-1',
    );

    expect(publishApprovalsService.assertPostMutable).toHaveBeenCalledTimes(1);
    expect(publishApprovalsService.assertPostMutable).toHaveBeenCalledWith(
      'org-1',
      'post-1',
    );
  });

  it('mints a version-bound approval when creating a scheduled post', async () => {
    const { postPublishQueueService, publishApprovalsService, service } =
      makeService();
    const scheduledDate = new Date(Date.now() + 60 * 60 * 1000);

    await service.create(
      {
        brandId: 'brand-1',
        credentialId: 'credential-1',
        description: 'Scheduled from the modal',
        ingredients: [],
        label: 'Scheduled',
        organizationId: 'org-1',
        platform: CredentialPlatform.TWITTER,
        scheduledDate,
        targetExecutionState: TargetExecutionState.SCHEDULED,
        userId: 'user-1',
      },
      [],
    );

    expect(publishApprovalsService.createForCurrentPost).toHaveBeenCalledWith({
      actorUserId: 'user-1',
      mode: 'scheduled',
      organizationId: 'org-1',
      postId: 'post-created',
      provenance: { surface: 'posts-service' },
    });
    expect(postPublishQueueService.enqueue).not.toHaveBeenCalled();
  });

  it('enqueues due-now scheduled creates immediately', async () => {
    const { postPublishQueueService, publishApprovalsService, service } =
      makeService();

    await service.create(
      {
        brandId: 'brand-1',
        credentialId: 'credential-1',
        description: 'Post now',
        ingredients: [],
        label: 'Now',
        organizationId: 'org-1',
        platform: CredentialPlatform.TWITTER,
        scheduledDate: new Date(),
        targetExecutionState: TargetExecutionState.SCHEDULED,
        userId: 'user-1',
      },
      [],
    );

    expect(publishApprovalsService.createForCurrentPost).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'immediate' }),
    );
    expect(postPublishQueueService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalId: 'approval-1',
        postId: 'post-created',
        source: 'publish_now',
      }),
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
        'user-1',
      ),
    ).rejects.toThrow('Post is locked by an approval');
    expect($transaction).not.toHaveBeenCalled();
  });
});

describe('post owner learning mutation protocol', () => {
  async function fixture() {
    const { patchPostWithLearning, removePostWithLearning } = await import(
      '@api/collections/posts/services/post-learning-mutation.util'
    );
    const rows: Record<string, unknown>[] = [
      {
        id: 'post',
        organizationId: 'org',
        brandId: 'brand',
        credentialId: 'credential',
        parentId: null,
        isDeleted: false,
        description: 'original',
        targetExecutionState: TargetExecutionState.PUBLISHED,
        visibility: PostVisibility.PUBLIC,
        platform: CredentialPlatform.TWITTER,
        publishApprovalId: 'approval',
        reviewVersionPinId: 'pin',
        ingredients: [{ id: 'ingredient-old' }],
      },
    ];
    const account = {
      id: 'account',
      organizationId: 'org',
      brandId: 'brand',
      credentialId: 'credential',
      isDeleted: false,
      evidenceRevision: 0,
    };
    const order: string[] = [],
      revision = vi.fn().mockResolvedValue({ count: 1 });
    const matches = (
      row: Record<string, unknown>,
      where: Record<string, unknown>,
    ) =>
      Object.entries(where).every(([key, value]) =>
        value && typeof value === 'object' && 'in' in value
          ? (value.in as unknown[]).includes(row[key])
          : value && typeof value === 'object' && 'not' in value
            ? row[key] !== value.not
            : row[key] === value,
      );
    const project = (
      row: Record<string, unknown>,
      select?: Record<string, unknown>,
    ) => {
      const current = {
        ...row,
        _count: {
          children: rows.filter(
            (child) => child.parentId === row.id && !child.isDeleted,
          ).length,
          ingredients: (row.ingredients as unknown[]).length,
        },
      };
      return select
        ? Object.fromEntries(
            Object.keys(select).map((key) => [
              key,
              current[key as keyof typeof current],
            ]),
          )
        : current;
    };
    const tx = {
      $queryRaw: vi.fn(async (sql) => {
        order.push(Array.isArray(sql) ? sql.join(' ') : sql.sql);
        return [{ id: 'locked' }];
      }),
      post: {
        findFirst: vi.fn(async ({ where, select }) => {
          const row = rows.find((row) => matches(row, where));
          return row ? project(row, select) : null;
        }),
        findMany: vi.fn(async ({ where, select }) =>
          rows
            .filter((row) => matches(row, where))
            .sort((a, b) => String(a.id).localeCompare(String(b.id)))
            .map((row) => project(row, select)),
        ),
        updateMany: vi.fn(async ({ where, data }) => {
          const selected = rows.filter((row) => matches(row, where));
          for (const row of selected) Object.assign(row, data);
          return { count: selected.length };
        }),
      },
      publishApproval: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'approval',
            organizationId: 'org',
            brandId: 'brand',
            postId: 'post',
            artifactVersionPinId: 'pin',
            status: 'published',
            scopeDigest: 'scope',
            invalidatedAt: null,
            operationId: 'operation',
          },
        ]),
      },
      contentVersionPin: {
        findMany: vi.fn().mockResolvedValue([{ id: 'pin' }]),
      },
      postPublishFinalization: {
        findMany: vi.fn().mockResolvedValue([{ id: 'finalization' }]),
      },
      contentLearningAccount: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: account.id,
            organizationId: account.organizationId,
            brandId: account.brandId,
            credentialId: account.credentialId,
          },
        ]),
        updateMany: revision,
      },
      contentLearningDependency: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const approvals = {
      assertPostMutable: vi.fn(),
      invalidatePost: vi.fn(
        async (_org, _id, _reason, _actor, transaction, defer) => {
          expect(transaction).toBe(tx);
          await tx.post.updateMany({
            where: { id: 'post', organizationId: 'org', isDeleted: false },
            data: { publishApprovalId: null, reviewVersionPinId: null },
          });
          defer(() => order.push('telemetry'));
        },
      ),
    };
    const context = {
      logger: { log: vi.fn() },
      publishApprovalsService: approvals,
      readPost: async (_tx: unknown, where: Record<string, unknown>) => {
        const row = rows.find((row) => matches(row, where));
        return row ? ({ ...row } as never) : null;
      },
      writePost: async (
        _tx: unknown,
        where: Record<string, unknown>,
        data: Record<string, unknown>,
      ) => {
        const row = rows.find((row) => matches(row, where));
        if (!row) throw new Error('stale post');
        const { ingredients, ...scalars } = data;
        Object.assign(row, scalars);
        if (ingredients)
          row.ingredients = (ingredients as { set: { id: string }[] }).set.map(
            (value) => ({ ...value }),
          );
        return { ...row } as never;
      },
    };
    return {
      patchPostWithLearning,
      removePostWithLearning,
      rows,
      tx,
      context,
      order,
      approvals,
      revision,
    };
  }
  it('same-count ingredient replacement invalidates already-published evidence and clears markers inside the one transaction', async () => {
    const value = await fixture();
    const result = await value.patchPostWithLearning(
      value.tx as never,
      value.context as never,
      'post',
      { ingredients: ['ingredient-new'] },
      [],
      'organization',
    );
    expect(value.approvals.assertPostMutable).toHaveBeenCalledWith(
      'org',
      'post',
      value.tx,
    );
    expect(value.approvals.invalidatePost).toHaveBeenCalledTimes(1);
    expect(result.updatedPost.publishApprovalId).toBeNull();
    expect(value.tx.contentLearningDependency.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sourceKind: 'post',
          sourceId: 'post',
          sourceOrganizationId: 'org',
          isDeleted: false,
        },
      }),
    );
    expect(value.revision).toHaveBeenCalledTimes(1);
    expect(value.order[0]).toContain('pg_advisory_xact_lock_shared(5728, 1)');
    expect(value.order[1]).toContain('pg_advisory_xact_lock(');
    expect(value.order[1]).toContain('hashtext(');
    expect(value.order[2]).toContain('content_learning_accounts');
    expect(value.order.indexOf('telemetry')).toBe(-1);
    result.afterCommit.forEach((emit) => {
      emit();
    });
    expect(value.order.at(-1)).toBe('telemetry');
  });
  it('same approved material and analytics-only metadata produce no learning or approval revision churn', async () => {
    const value = await fixture();
    await value.patchPostWithLearning(
      value.tx as never,
      value.context as never,
      'post',
      { description: 'original' },
      [],
      'organization',
    );
    await value.patchPostWithLearning(
      value.tx as never,
      value.context as never,
      'post',
      { analyticsCollectionError: 'retry' } as never,
      [],
      'organization',
    );
    expect(value.approvals.invalidatePost).not.toHaveBeenCalled();
    expect(value.revision).not.toHaveBeenCalled();
    expect(value.tx.contentLearningDependency.findMany).not.toHaveBeenCalled();
  });
  it('parent and child removal deduplicates account revision and propagates actual invalidation failure', async () => {
    const first = await fixture();
    first.rows.push({
      ...first.rows[0],
      id: 'child',
      parentId: 'post',
      publishApprovalId: null,
    });
    const result = await first.removePostWithLearning(
      first.tx as never,
      first.context as never,
      'post',
      'organization',
    );
    expect(result?.childrenDeleted).toBe(1);
    expect(first.rows.every((row) => row.isDeleted)).toBe(true);
    expect(first.revision).toHaveBeenCalledTimes(1);
    expect(first.tx.post.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['child'] },
        parentId: 'post',
        organizationId: 'org',
        isDeleted: false,
      },
      data: { isDeleted: true },
    });
    const second = await fixture();
    second.tx.contentLearningDependency.findMany.mockRejectedValue(
      new Error('dependency failure'),
    );
    await expect(
      second.removePostWithLearning(
        second.tx as never,
        second.context as never,
        'post',
        'organization',
      ),
    ).rejects.toThrow('dependency failure');
    expect(second.revision).not.toHaveBeenCalled();
  });
  it('an absent post remains null and effective cross-org retarget is refused before any mutation', async () => {
    const value = await fixture();
    await expect(
      value.removePostWithLearning(
        value.tx as never,
        value.context as never,
        'missing',
        'organization',
      ),
    ).resolves.toBeNull();
    await expect(
      value.patchPostWithLearning(
        value.tx as never,
        value.context as never,
        'post',
        { organizationId: 'foreign' },
        [],
        'organization',
      ),
    ).rejects.toThrow(/authorized brand relocation/);
    expect(value.tx.post.updateMany).not.toHaveBeenCalled();
    expect(value.revision).not.toHaveBeenCalled();
  });
  it.each(['second source', 'dependency', 'revision'])(
    'remove propagates %s failure through the owning transaction and restores the complete cascade',
    async (failure) => {
      const value = await fixture();
      value.rows.push({
        ...value.rows[0],
        id: 'child',
        parentId: 'post',
        publishApprovalId: null,
      });
      if (failure === 'second source')
        value.context.writePost = vi
          .fn()
          .mockRejectedValue(new Error('second source failed'));
      else if (failure === 'dependency')
        value.tx.contentLearningDependency.findMany.mockRejectedValue(
          new Error('dependency failed'),
        );
      else value.revision.mockResolvedValue({ count: 0 });
      const before = structuredClone(value.rows);
      const transaction = async () => {
        try {
          return await value.removePostWithLearning(
            value.tx as never,
            value.context as never,
            'post',
            'organization',
          );
        } catch (error) {
          value.rows.forEach((row, index) => {
            Object.assign(row, before[index]);
          });
          throw error;
        }
      };
      await expect(transaction()).rejects.toThrow(
        failure === 'revision' ? /account changed/ : `${failure} failed`,
      );
      expect(value.tx.post.updateMany).toHaveBeenCalledTimes(1);
      expect(value.rows).toEqual(before);
      expect(value.order).not.toContain('telemetry');
    },
  );
  it('approval-bound source deletion fields respect the transaction lease guard before any write', async () => {
    const value = await fixture();
    value.approvals.assertPostMutable.mockRejectedValue(
      new Error('active execution'),
    );
    await expect(
      value.patchPostWithLearning(
        value.tx as never,
        value.context as never,
        'post',
        { isDeleted: true },
        [],
        'organization',
      ),
    ).rejects.toThrow('active execution');
    expect(value.approvals.assertPostMutable).toHaveBeenCalledExactlyOnceWith(
      'org',
      'post',
      value.tx,
    );
    expect(value.rows[0].isDeleted).toBe(false);
    expect(value.tx.post.updateMany).not.toHaveBeenCalled();
    expect(value.revision).not.toHaveBeenCalled();
  });
  it('a scheduled child with an active approval prevents the cascade before either source write', async () => {
    const value = await fixture();
    value.rows.push({
      ...value.rows[0],
      id: 'child',
      parentId: 'post',
      targetExecutionState: TargetExecutionState.DRAFT,
      publishApprovalId: 'child-approval',
    });
    const rootApproval = (await value.tx.publishApproval.findMany())[0];
    value.tx.publishApproval.findMany.mockResolvedValue([
      rootApproval,
      { ...rootApproval, id: 'child-approval', postId: 'child' },
    ]);
    value.approvals.assertPostMutable.mockImplementation(
      async (_organizationId, id) => {
        if (id === 'child')
          throw new Error('child provider execution is in flight');
      },
    );
    await expect(
      value.patchPostWithLearning(
        value.tx as never,
        value.context as never,
        'post',
        { targetExecutionState: TargetExecutionState.SCHEDULED },
        [],
        'organization',
      ),
    ).rejects.toThrow('child provider execution is in flight');
    expect(value.approvals.assertPostMutable).toHaveBeenCalledExactlyOnceWith(
      'org',
      'child',
      value.tx,
    );
    expect(value.tx.post.updateMany).not.toHaveBeenCalled();
    expect(value.rows[0].targetExecutionState).toBe(
      TargetExecutionState.PUBLISHED,
    );
    expect(value.rows[1].targetExecutionState).toBe(TargetExecutionState.DRAFT);
    expect(value.revision).not.toHaveBeenCalled();
  });
});

describe('PostsService child creation authority', () => {
  type Row = Record<string, unknown>;
  type Binding = {
    bindScheduledPublish: (post: unknown, userId?: string) => Promise<void>;
  };
  function matches(row: Row, where: Row): boolean {
    return Object.entries(where).every(([key, value]) => {
      if (key === 'OR')
        return (value as Row[]).some((condition) => matches(row, condition));
      if (value && typeof value === 'object' && 'in' in value)
        return (value.in as unknown[]).includes(row[key]);
      return row[key] === value;
    });
  }
  function fixture() {
    const parent: Row = {
      id: 'parent',
      organizationId: 'org',
      brandId: 'brand',
      credentialId: 'parent-credential',
      parentId: null,
      isDeleted: false,
      description: 'published parent',
      category: 'TEXT',
      platform: CredentialPlatform.TWITTER,
      targetExecutionState: TargetExecutionState.PUBLISHED,
      visibility: PostVisibility.PUBLIC,
      publishApprovalId: 'approval',
      reviewVersionPinId: 'pin',
      ingredients: [],
    };
    const rows: Row[] = [parent],
      order: string[] = [];
    const accounts: Row[] = ['parent-credential', 'child-credential'].map(
      (credentialId, index) => ({
        id: index ? 'z-child-account' : 'a-parent-account',
        organizationId: 'org',
        brandId: 'brand',
        credentialId,
        isDeleted: false,
        evidenceRevision: 0,
      }),
    );
    const approvals: Row[] = [
      {
        id: 'approval',
        organizationId: 'org',
        brandId: 'brand',
        postId: 'parent',
        artifactVersionPinId: 'pin',
        status: 'published',
        invalidatedAt: null,
      },
    ];
    const project = (row: Row, select?: Row) => {
      const current: Row = {
        ...row,
        _count: {
          children: rows.filter(
            (child) => child.parentId === row.id && !child.isDeleted,
          ).length,
          ingredients: (row.ingredients as unknown[]).length,
        },
      };
      return select
        ? Object.fromEntries(
            Object.keys(select).map((key) => [key, current[key]]),
          )
        : current;
    };
    const tx = {
      $queryRaw: vi.fn(async (sql) => {
        order.push(
          Array.isArray(sql)
            ? sql.join(' ')
            : `${sql.sql} ${sql.values.join(' ')}`,
        );
        return [{ id: 'locked' }];
      }),
      post: {
        findFirst: vi.fn(async ({ where, select }) => {
          const row = rows.find((row) => matches(row, where));
          return row ? project(row, select) : null;
        }),
        findMany: vi.fn(async ({ where, select }) =>
          rows
            .filter((row) => matches(row, where))
            .map((row) => project(row, select)),
        ),
        create: vi.fn(async ({ data, include }) => {
          order.push('insert');
          const row = {
            ...data,
            id: 'child',
            isDeleted: data.isDeleted ?? false,
            ingredients: data.ingredients?.connect ?? [],
            tags: data.tags?.connect ?? [],
          };
          rows.push(row);
          return include ? { ...row } : row;
        }),
      },
      credential: {
        findFirst: vi.fn(async ({ where }) =>
          where.organizationId === 'org' &&
          where.brandId === 'brand' &&
          where.id === 'child-credential'
            ? { id: where.id }
            : null,
        ),
      },
      publishApproval: {
        findMany: vi.fn(async ({ select }) =>
          approvals.map((row) =>
            select
              ? Object.fromEntries(
                  Object.keys(select).map((key) => [key, row[key]]),
                )
              : { ...row },
          ),
        ),
      },
      contentVersionPin: {
        findMany: vi.fn().mockResolvedValue([{ id: 'pin' }]),
      },
      postPublishFinalization: {
        findMany: vi.fn().mockResolvedValue([{ id: 'finalization' }]),
      },
      contentLearningAccount: {
        findMany: vi.fn(async ({ where, select }) =>
          accounts
            .filter((row) => matches(row, where))
            .map((row) =>
              Object.fromEntries(
                Object.keys(select).map((key) => [key, row[key]]),
              ),
            ),
        ),
        updateMany: vi.fn(async ({ where }) => {
          const row = accounts.find((row) => matches(row, where));
          if (!row) return { count: 0 };
          row.evidenceRevision = Number(row.evidenceRevision) + 1;
          return { count: 1 };
        }),
      },
      contentLearningDependency: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const approvalService = {
      assertPostMutable: vi.fn(async (_org, _id, transaction) => {
        expect(transaction).toBe(tx);
        order.push('guard');
      }),
      invalidatePost: vi.fn(
        async (_org, _id, _reason, _actor, transaction, defer) => {
          expect(transaction).toBe(tx);
          order.push('invalidate');
          parent.publishApprovalId = null;
          parent.reviewVersionPinId = null;
          defer(() => order.push('telemetry'));
        },
      ),
    };
    const transaction = vi.fn(async (callback) => {
      const before = structuredClone({ rows, accounts, approvals });
      try {
        const result = await callback(tx);
        order.push('commit');
        return result;
      } catch (error) {
        Object.assign(parent, before.rows[0]);
        rows.splice(0, rows.length, parent, ...before.rows.slice(1));
        accounts.forEach((row, index) => {
          Object.assign(row, before.accounts[index]);
        });
        approvals.forEach((row, index) => {
          Object.assign(row, before.approvals[index]);
        });
        throw error;
      }
    });
    const cache = {
        invalidateByTags: vi.fn(async () => {
          order.push('cache');
        }),
      },
      logger = {
        log: vi.fn(() => order.push('log')),
        debug: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      };
    const prisma = { ...tx, $transaction: transaction };
    const make = (protectedService = true) =>
      new PostsService(
        prisma as never,
        logger as never,
        {} as never,
        cache as never,
        undefined,
        protectedService ? (approvalService as never) : undefined,
      );
    const service = make(),
      bind = vi.spyOn(service as unknown as Binding, 'bindScheduledPublish');
    const dto = {
      parentId: 'parent',
      organizationId: 'org',
      brandId: 'brand',
      credentialId: 'child-credential',
      description: 'new child',
      label: 'child',
      category: PostCategory.TEXT,
      platform: CredentialPlatform.TWITTER,
      targetExecutionState: TargetExecutionState.DRAFT,
      userId: 'user',
      ingredients: [],
      tags: [],
    };
    return {
      service,
      make,
      dto,
      tx,
      parent,
      rows,
      accounts,
      approvals,
      order,
      transaction,
      cache,
      logger,
      approvalService,
      bind,
    };
  }
  it('direct child create fences first and locks parent/prospective accounts before sources, revising only the factual changed parent once', async () => {
    const value = fixture();
    const created = await value.service.create(value.dto, []);
    expect(created.id).toBe('child');
    expect(value.order[0]).toContain('pg_advisory_xact_lock_shared(5728, 1)');
    expect(value.order[1]).toContain('pg_advisory_xact_lock(');
    expect(value.order[1]).toContain('hashtext(');
    expect(value.order[2]).toContain('a-parent-account');
    expect(value.order[3]).toContain('z-child-account');
    expect(value.order[4]).toContain('organizations');
    expect(
      value.order
        .slice(4)
        .filter((entry) => entry.includes('content_learning_accounts')),
    ).toEqual([]);
    expect(
      value.approvalService.assertPostMutable,
    ).toHaveBeenCalledExactlyOnceWith('org', 'parent', value.tx);
    expect(
      value.approvalService.invalidatePost.mock.calls[0].slice(0, 5),
    ).toEqual([
      'org',
      'parent',
      'Post thread membership changed.',
      undefined,
      value.tx,
    ]);
    expect(value.tx.contentLearningDependency.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sourceKind: 'post',
          sourceId: 'parent',
          sourceOrganizationId: 'org',
          isDeleted: false,
        },
      }),
    );
    expect(value.accounts.map((row) => row.evidenceRevision)).toEqual([1, 0]);
    expect(value.order.slice(-3)).toEqual(['commit', 'cache', 'telemetry']);
    expect(value.bind).toHaveBeenCalledTimes(1);
    expect(value.tx.post.create.mock.calls[0][0].data).toMatchObject({
      ingredients: { connect: [] },
      tags: { connect: [] },
      parentId: 'parent',
    });
  });
  it('guards an executing parent approval despite a null post pointer before inserting or emitting anything', async () => {
    const value = fixture();
    value.parent.publishApprovalId = null;
    value.parent.reviewVersionPinId = null;
    value.approvals[0].status = 'executing';
    value.approvalService.assertPostMutable.mockRejectedValue(
      new Error('provider execution in flight'),
    );
    await expect(value.service.create(value.dto, [])).rejects.toThrow(
      'provider execution in flight',
    );
    expect(value.tx.post.create).not.toHaveBeenCalled();
    expect(value.cache.invalidateByTags).not.toHaveBeenCalled();
    expect(value.bind).not.toHaveBeenCalled();
    expect(value.tx.contentLearningAccount.updateMany).not.toHaveBeenCalled();
    expect(value.order).not.toContain('telemetry');
  });
  it.each([
    'missing',
    'deleted',
    'foreign org',
    'foreign brand',
    'credential',
    'retarget',
    'service',
  ])('rejects %s parent authority before insertion', async (failure) => {
    const value = fixture();
    if (failure === 'missing') value.rows.splice(0);
    if (failure === 'deleted') value.parent.isDeleted = true;
    if (failure === 'foreign org') value.parent.organizationId = 'foreign';
    if (failure === 'foreign brand') value.parent.brandId = 'other-brand';
    if (failure === 'credential')
      value.tx.credential.findFirst.mockResolvedValue(null);
    if (failure === 'retarget') {
      const read = value.tx.post.findFirst.getMockImplementation();
      if (!read) throw new Error('Missing post read fixture');
      let reads = 0;
      value.tx.post.findFirst.mockImplementation(async (args) => {
        if (++reads === 2) value.parent.organizationId = 'foreign';
        return read(args);
      });
    }
    await expect(
      (failure === 'service' ? value.make(false) : value.service).create(
        value.dto,
        [],
      ),
    ).rejects.toThrow();
    expect(value.tx.post.create).not.toHaveBeenCalled();
    expect(value.cache.invalidateByTags).not.toHaveBeenCalled();
    expect(value.tx.contentLearningAccount.updateMany).not.toHaveBeenCalled();
  });
  it.each(['insert', 'approval', 'dependency', 'revision'])(
    '%s failure rolls back child, parent markers and revisions with no child aftercommit effects',
    async (failure) => {
      const value = fixture(),
        before = structuredClone({
          rows: value.rows,
          accounts: value.accounts,
          approvals: value.approvals,
        });
      if (failure === 'insert')
        value.tx.post.create.mockRejectedValue(new Error('insert failed'));
      if (failure === 'approval')
        value.approvalService.invalidatePost.mockRejectedValue(
          new Error('approval failed'),
        );
      if (failure === 'dependency')
        value.tx.contentLearningDependency.findMany.mockRejectedValue(
          new Error('dependency failed'),
        );
      if (failure === 'revision')
        value.tx.contentLearningAccount.updateMany.mockResolvedValue({
          count: 0,
        });
      await expect(
        value.service.create(
          {
            ...value.dto,
            scheduledDate: new Date('2026-10-03T10:00:00.000Z'),
            timezone: 'UTC',
          },
          [],
        ),
      ).rejects.toThrow();
      expect({
        rows: value.rows,
        accounts: value.accounts,
        approvals: value.approvals,
      }).toEqual(before);
      expect(value.cache.invalidateByTags).not.toHaveBeenCalled();
      expect(value.bind).not.toHaveBeenCalled();
      expect(value.logger.log).not.toHaveBeenCalled();
      expect(value.order).not.toContain('telemetry');
    },
  );
  it('a tombstoned child insert leaves actual parent live-child count and learning unchanged', async () => {
    const value = fixture();
    await value.service.create({ ...value.dto, isDeleted: true } as never, []);
    expect(value.rows[1].isDeleted).toBe(true);
    expect(value.parent.publishApprovalId).toBe('approval');
    expect(value.approvalService.invalidatePost).not.toHaveBeenCalled();
    expect(value.tx.contentLearningDependency.findMany).not.toHaveBeenCalled();
    expect(value.tx.contentLearningAccount.updateMany).not.toHaveBeenCalled();
  });
  it('scheduled child validation, original timezone log and binder occur once after committed source invalidation', async () => {
    const value = fixture();
    const created = await value.service.create(
      {
        ...value.dto,
        targetExecutionState: TargetExecutionState.SCHEDULED,
        scheduledDate: new Date('2026-10-03T10:00:00.000Z'),
        timezone: 'UTC',
      },
      [],
    );
    expect(created.targetExecutionState).toBe(TargetExecutionState.SCHEDULED);
    expect(value.bind).toHaveBeenCalledExactlyOnceWith(created, 'user');
    expect(value.logger.log).toHaveBeenCalledWith(
      `Converting scheduledDate from UTC to UTC: ${new Date('2026-10-03T10:00:00.000Z')} → 2026-10-03T10:00:00.000Z`,
    );
    expect(value.order.slice(-4)).toEqual([
      'commit',
      'cache',
      'telemetry',
      'log',
    ]);
  });
  it('missing child organization is refused before any fence without inheriting the parent tenant', async () => {
    const value = fixture();
    await expect(
      value.service.create({ ...value.dto, organizationId: undefined }, []),
    ).rejects.toThrow('exact parent and organization');
    expect(
      value.order.filter((entry) => entry.includes('pg_advisory')),
    ).toEqual([]);
    expect(value.tx.post.create).not.toHaveBeenCalled();
    expect(value.cache.invalidateByTags).not.toHaveBeenCalled();
  });
  it('omitted child brand uses exact null equality and never inherits the parent credential', async () => {
    const value = fixture();
    value.parent.brandId = null;
    await value.service.create(
      { ...value.dto, brandId: undefined, credentialId: undefined },
      [],
    );
    const data = value.tx.post.create.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('brandId');
    expect(data).not.toHaveProperty('credentialId');
    expect(value.tx.credential.findFirst).not.toHaveBeenCalled();
    expect(value.tx.contentLearningAccount.updateMany).not.toHaveBeenCalled();
  });
  it('scheduled child retains channel validation before opening a transaction', async () => {
    const value = fixture();
    await expect(
      value.service.create(
        {
          ...value.dto,
          targetExecutionState: TargetExecutionState.SCHEDULED,
          platform: CredentialPlatform.YOUTUBE,
          category: PostCategory.IMAGE,
          ingredients: [],
        },
        [],
      ),
    ).rejects.toBeInstanceOf(InvalidChannelTargetScheduleException);
    expect(value.transaction).not.toHaveBeenCalled();
    expect(value.bind).not.toHaveBeenCalled();
  });
});
