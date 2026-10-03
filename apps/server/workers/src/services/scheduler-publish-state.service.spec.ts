import {
  buildArtifactContentDigest,
  projectPostArtifactMaterial,
} from '@api/agent-artifacts/agent-artifact-material.util';
import { bindLearningPublicationV1 } from '@api/collections/content-learning/services/learning-artifact-binding.helper';
import { CONTENT_LEARNING_ACTION_IDS } from '@api/collections/workflows/templates/content-learning-workflows.template';
import type { PostLifecycleTransitionInput } from '@api/post-lifecycle/post-lifecycle.service';
import {
  PostCategory,
  PostFormat,
  PostVisibility,
  PublishApprovalStatus,
  ReleaseStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import {
  queueLearningPublicationRefreshV1,
  SchedulerPublishStateService,
} from '@workers/services/scheduler-publish-state.service';

vi.mock(
  '@api/collections/content-learning/services/learning-artifact-binding.helper',
  () => ({ bindLearningPublicationV1: vi.fn() }),
);

function createLifecycleService(
  kind: 'stale' | 'transitioned' = 'transitioned',
) {
  return {
    transition: vi.fn(async (input, tx) => {
      if (kind === 'stale') return { kind };
      const row = await tx.post.findFirst({
        where: { id: input.postId, organizationId: input.organizationId },
      });
      tx.post.applyMutation(input);
      return { kind, target: row };
    }),
  };
}

function transactionFixture(parts: Record<string, unknown> = {}) {
  let current: Record<string, unknown> | undefined;
  const post = (parts.post ?? {}) as Record<string, unknown>;
  const findFirst = vi.fn(
    async ({ where }: { where: { id: string; organizationId: string } }) => {
      current ??= publicationPost({
        id: where.id,
        organizationId: where.organizationId,
      });
      return structuredClone(current);
    },
  );
  const applyMutation = (input: PostLifecycleTransitionInput) => {
    Object.assign(
      current ?? {},
      input.mutation,
      { targetExecutionState: input.nextState },
      input.visibility ? { visibility: input.visibility } : {},
    );
  };
  Object.assign(post, { findFirst, applyMutation });
  return {
    $queryRaw: vi.fn().mockResolvedValue([]),
    contentLearningAccount: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    contentLearningDependency: { findMany: vi.fn().mockResolvedValue([]) },
    postPublishFinalization: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'finalization-1' }),
    },
    ...parts,
    post: post as typeof post & {
      findFirst: typeof findFirst;
      applyMutation: typeof applyMutation;
    },
    organization: { findFirst: vi.fn().mockResolvedValue(null) },
  };
}

function publicationPost(overrides: Record<string, unknown> = {}) {
  return {
    id: 'post-1',
    organizationId: 'org-1',
    brandId: 'brand-1',
    credentialId: 'cred-1',
    targetExecutionState: TargetExecutionState.PUBLISHING,
    visibility: PostVisibility.PUBLIC,
    externalId: null,
    publishedAt: null,
    description: 'Approved text',
    category: PostCategory.TEXT,
    format: PostFormat.STANDARD,
    isDeleted: false,
    workflowExecutionId: 'execution-current',
    publishApprovalId: null,
    reviewVersionPinId: null,
    platform: 'twitter',
    parentId: null,
    targetAttachments: [],
    quoteTweetId: null,
    entityArticleId: null,
    entityIngredientId: null,
    entityModel: null,
    _count: { ingredients: 0, children: 0 },
    ...overrides,
  };
}

describe('SchedulerPublishStateService', () => {
  it('persists a provider outcome and timestamps derived partial success without writing status', async () => {
    const post = {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { targetExecutionState: TargetExecutionState.PUBLISHED },
          { targetExecutionState: TargetExecutionState.FAILED },
        ]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    const postGroup = {
      findFirst: vi.fn().mockResolvedValue({
        id: 'group-1',
        publishedAt: null,
        status: ReleaseStatus.PUBLISHING,
        statusTransitions: [],
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    const prisma = {
      $transaction: vi.fn(async (callback) =>
        callback(transactionFixture({ post, postGroup })),
      ),
    };
    const postLifecycleService = createLifecycleService();
    const service = new SchedulerPublishStateService(
      prisma as never,
      {
        warn: vi.fn(),
      } as never,
      postLifecycleService as never,
    );
    const publishedAt = new Date('2026-07-16T00:10:00.000Z');

    await service.transition({
      groupId: 'group-1',
      organizationId: 'org-1',
      postId: 'target-1',
      update: {
        error: null,
        executionState: TargetExecutionState.PUBLISHED,
        externalId: 'provider-1',
        publishedAt,
        url: 'https://social.example/provider-1',
        visibility: PostVisibility.PRIVATE,
      },
    });

    expect(postLifecycleService.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        mutation: expect.objectContaining({
          externalId: 'provider-1',
          publishedAt,
          url: 'https://social.example/provider-1',
        }),
        nextState: TargetExecutionState.PUBLISHED,
        organizationId: 'org-1',
        postId: 'target-1',
        visibility: PostVisibility.PRIVATE,
      }),
      expect.objectContaining({ post, postGroup }),
    );
    expect(postGroup.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { publishedAt: expect.any(Date) },
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'ReadCommitted',
    });
  });

  it('retries a serialization conflict so concurrent target completions converge', async () => {
    const post = {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { targetExecutionState: TargetExecutionState.PUBLISHED },
          { targetExecutionState: TargetExecutionState.PUBLISHED },
        ]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    const postGroup = {
      findFirst: vi.fn().mockResolvedValue({
        id: 'group-1',
        publishedAt: null,
        status: ReleaseStatus.PUBLISHING,
        statusTransitions: [],
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    const prisma = {
      $transaction: vi
        .fn()
        .mockRejectedValueOnce({ code: 'P2034' })
        .mockImplementationOnce(async (callback) =>
          callback(transactionFixture({ post, postGroup })),
        ),
    };
    const logger = { warn: vi.fn() };
    const postLifecycleService = createLifecycleService();
    const service = new SchedulerPublishStateService(
      prisma as never,
      logger as never,
      postLifecycleService as never,
    );

    await service.transition({
      groupId: 'group-1',
      organizationId: 'org-1',
      postId: 'target-1',
      update: {
        executionState: TargetExecutionState.PUBLISHED,
        visibility: PostVisibility.PUBLIC,
      },
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('retrying concurrent roll-up'),
      expect.objectContaining({ attempt: 1, groupId: 'group-1' }),
    );
    expect(postGroup.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { publishedAt: expect.any(Date) } }),
    );
  });

  it('fails malformed target sets closed without writing a release status', async () => {
    const post = {
      findMany: vi
        .fn()
        .mockResolvedValue([{ targetExecutionState: 'not-a-target-state' }]),
    };
    const postGroup = {
      findFirst: vi.fn().mockResolvedValue({
        id: 'group-1',
        publishedAt: null,
      }),
      updateMany: vi.fn(),
    };
    const prisma = {
      $transaction: vi.fn(async (callback) =>
        callback(transactionFixture({ post, postGroup })),
      ),
    };
    const logger = { warn: vi.fn() };
    const service = new SchedulerPublishStateService(
      prisma as never,
      logger as never,
      createLifecycleService() as never,
    );

    await service.transition({
      groupId: 'group-1',
      organizationId: 'org-1',
      postId: 'target-1',
      update: {
        executionState: TargetExecutionState.FAILED,
      },
    });

    expect(postGroup.updateMany).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('release status derivation failed closed'),
      expect.objectContaining({
        code: 'invalid-target-state',
        groupId: 'group-1',
      }),
    );
  });

  it('transitions with canonical tenant identifiers', async () => {
    const service = new SchedulerPublishStateService(
      {} as never,
      {} as never,
      createLifecycleService() as never,
    );
    const transition = vi.spyOn(service, 'transition').mockResolvedValue(true);

    const grouped = await service.transitionPost(
      {
        groupId: 'group-1',
        id: 'post-1',
        organizationId: 'org-1',
      },
      {
        executionState: TargetExecutionState.PUBLISHED,
        visibility: PostVisibility.PUBLIC,
      },
      'Provider confirmed publication',
    );

    expect(grouped).toBe(true);
    expect(transition).toHaveBeenCalledWith({
      finalization: undefined,
      groupId: 'group-1',
      guard: undefined,
      organizationId: 'org-1',
      postId: 'post-1',
      reason: 'Provider confirmed publication',
      update: {
        executionState: TargetExecutionState.PUBLISHED,
        visibility: PostVisibility.PUBLIC,
      },
    });
  });

  it('persists publication finalization in the state transition transaction', async () => {
    const post = { findMany: vi.fn(), updateMany: vi.fn() };
    const postGroup = { findFirst: vi.fn(), updateMany: vi.fn() };
    const postPublishFinalization = {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'finalization-1' }),
    };
    const prisma = {
      $transaction: vi.fn(async (callback) =>
        callback(
          transactionFixture({ post, postGroup, postPublishFinalization }),
        ),
      ),
    };
    const service = new SchedulerPublishStateService(
      prisma as never,
      { warn: vi.fn() } as never,
      createLifecycleService() as never,
    );

    await service.transitionPost(
      { id: 'post-1', organizationId: 'org-1' },
      {
        executionState: TargetExecutionState.PUBLISHED,
        externalId: 'provider-1',
        visibility: PostVisibility.PUBLIC,
      },
      'Provider confirmed publication',
      {
        priorExecutionStates: [TargetExecutionState.PUBLISHING],
      },
      {
        result: {
          executionState: TargetExecutionState.PUBLISHED,
          platform: 'twitter',
          externalId: 'provider-1',
          success: true,
        },
        source: 'CronTiktokStatusService.applyStatusTransition',
      },
    );

    expect(postPublishFinalization.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        postId: 'post-1',
        result: expect.objectContaining({ success: true }),
        source: 'CronTiktokStatusService.applyStatusTransition',
      },
    });
  });

  describe('learning publication binding after commit', () => {
    const bind = vi.mocked(bindLearningPublicationV1);
    function bindingHarness(
      finalization: { findUnique: ReturnType<typeof vi.fn> } = {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      lifecycle = createLifecycleService(),
    ) {
      const postPublishFinalization = {
        ...finalization,
        create: vi.fn().mockResolvedValue({ id: 'finalization-1' }),
      };
      const prisma = {
        $transaction: vi.fn(async (callback) =>
          callback(
            transactionFixture({
              post: { findMany: vi.fn(), updateMany: vi.fn() },
              postGroup: { findFirst: vi.fn(), updateMany: vi.fn() },
              postPublishFinalization,
            }),
          ),
        ),
      };
      const logger = { warn: vi.fn() };
      const service = new SchedulerPublishStateService(
        prisma as never,
        logger as never,
        lifecycle as never,
      );
      const publish = (state = TargetExecutionState.PUBLISHED) =>
        service.transitionPost(
          { id: 'post-1', organizationId: 'org-1' },
          {
            executionState: state,
            externalId: 'provider-1',
            visibility: PostVisibility.PUBLIC,
          },
          'Provider confirmed publication',
          { priorExecutionStates: [TargetExecutionState.PUBLISHING] },
          {
            result: {
              executionState: TargetExecutionState.PUBLISHED,
              platform: 'twitter',
              externalId: 'provider-1',
              success: true,
            },
            source: 'CronTiktokStatusService.applyStatusTransition',
          },
        );
      return { prisma, logger, postPublishFinalization, publish };
    }
    beforeEach(() => {
      bind.mockReset();
      bind.mockResolvedValue({ status: 'bound' });
    });
    it('binds once after the transaction commits when a finalization is created', async () => {
      const h = bindingHarness();
      expect(await h.publish()).toBe(true);
      expect(h.postPublishFinalization.create).toHaveBeenCalledOnce();
      expect(bind).toHaveBeenCalledOnce();
      expect(bind).toHaveBeenCalledWith(h.prisma, 'org-1', 'post-1');
      expect(bind.mock.invocationCallOrder[0]).toBeGreaterThan(
        h.prisma.$transaction.mock.invocationCallOrder[0],
      );
    });
    it('does not bind a replayed transition whose finalization already exists', async () => {
      const h = bindingHarness({
        findUnique: vi.fn().mockResolvedValue({ id: 'finalization-0' }),
      });
      expect(await h.publish()).toBe(true);
      expect(h.postPublishFinalization.create).not.toHaveBeenCalled();
      expect(bind).not.toHaveBeenCalled();
    });
    it('does not bind a stale transition', async () => {
      const h = bindingHarness(undefined, createLifecycleService('stale'));
      expect(await h.publish()).toBe(false);
      expect(bind).not.toHaveBeenCalled();
    });
    it('does not bind a non-public PUBLISHING transition', async () => {
      const h = bindingHarness();
      await h.publish(TargetExecutionState.PUBLISHING);
      expect(h.postPublishFinalization.create).not.toHaveBeenCalled();
      expect(bind).not.toHaveBeenCalled();
    });
    it('keeps the publish successful when learning binding rejects', async () => {
      bind.mockRejectedValue(new Error('learning down'));
      const h = bindingHarness();
      expect(await h.publish()).toBe(true);
      expect(h.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('learning publication binding skipped'),
        expect.objectContaining({ postId: 'post-1' }),
      );
    });
  });

  it('persists provider URLs and workflow provenance for legacy ungrouped posts', async () => {
    const post = {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    const postGroup = {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    };
    const prisma = {
      $transaction: vi.fn(async (callback) =>
        callback(transactionFixture({ post, postGroup })),
      ),
    };
    const postLifecycleService = createLifecycleService();
    const service = new SchedulerPublishStateService(
      prisma as never,
      { warn: vi.fn() } as never,
      postLifecycleService as never,
    );

    const applied = await service.transitionPost(
      { id: 'legacy-post-1', organizationId: 'org-1' },
      {
        executionState: TargetExecutionState.PUBLISHED,
        visibility: PostVisibility.PUBLIC,
        url: 'https://www.youtube.com/watch?v=video-1',
        workflowExecutionId: 'execution-1',
      },
    );

    expect(applied).toBe(true);
    expect(postLifecycleService.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        mutation: expect.objectContaining({
          url: 'https://www.youtube.com/watch?v=video-1',
          workflowExecutionId: 'execution-1',
        }),
      }),
      expect.anything(),
    );
    expect(postGroup.findFirst).not.toHaveBeenCalled();
    expect(postGroup.updateMany).not.toHaveBeenCalled();
  });

  it('ignores an outcome from a stale workflow execution', async () => {
    const post = {};
    const postGroup = {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    };
    const prisma = {
      $transaction: vi.fn(async (callback) =>
        callback(transactionFixture({ post, postGroup })),
      ),
    };
    const logger = { warn: vi.fn() };
    const postLifecycleService = createLifecycleService('stale');
    const service = new SchedulerPublishStateService(
      prisma as never,
      logger as never,
      postLifecycleService as never,
    );

    const applied = await service.transition({
      groupId: 'group-1',
      guard: {
        expectedWorkflowExecutionId: 'execution-current',
        priorExecutionStates: [TargetExecutionState.PUBLISHING],
      },
      organizationId: 'org-1',
      postId: 'target-1',
      update: {
        executionState: TargetExecutionState.PUBLISHED,
        visibility: PostVisibility.PUBLIC,
      },
    });

    expect(applied).toBe(false);
    expect(postLifecycleService.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        guard: {
          expectedWorkflowExecutionId: 'execution-current',
          priorExecutionStates: [TargetExecutionState.PUBLISHING],
        },
      }),
      expect.anything(),
    );
    expect(postGroup.findFirst).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('ignored stale publish transition'),
      expect.objectContaining({
        expectedWorkflowExecutionId: 'execution-current',
        postId: 'target-1',
      }),
    );
  });

  describe('tenant identity coercion', () => {
    it('refuses a transition when the post carries no usable tenant identity', async () => {
      const service = new SchedulerPublishStateService(
        {} as never,
        {} as never,
        createLifecycleService() as never,
      );
      const transition = vi.spyOn(service, 'transition');

      const blank = await service.transitionPost(
        { id: '   ', organizationId: 'org-1' },
        {
          executionState: TargetExecutionState.PUBLISHED,
        },
      );
      const opaque = await service.transitionPost(
        { id: 'post-1', organizationId: {} },
        {
          executionState: TargetExecutionState.PUBLISHED,
        },
      );

      expect(blank).toBe(false);
      expect(opaque).toBe(false);
      expect(transition).not.toHaveBeenCalled();
    });

    it('normalises nested, numeric and stringifiable identifiers', async () => {
      const service = new SchedulerPublishStateService(
        {} as never,
        {} as never,
        createLifecycleService() as never,
      );
      const transition = vi
        .spyOn(service, 'transition')
        .mockResolvedValue(true);

      await service.transitionPost(
        {
          groupId: { id: 'group-9' },
          id: 42,
          organizationId: { toString: () => 'org-9' },
        },
        {
          executionState: TargetExecutionState.PUBLISHED,
        },
      );

      expect(transition).toHaveBeenCalledWith(
        expect.objectContaining({
          groupId: 'group-9',
          organizationId: 'org-9',
          postId: '42',
        }),
      );
    });
  });

  describe('release roll-up failures', () => {
    const buildPrisma = (
      overrides: {
        groupRow?: unknown;
        groupUpdateCount?: number;
        targets?: { targetExecutionState: string }[];
      } = {},
    ) => {
      const post = {
        findMany: vi
          .fn()
          .mockResolvedValue(
            overrides.targets ?? [
              { targetExecutionState: TargetExecutionState.PUBLISHED },
            ],
          ),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      };
      const postGroup = {
        findFirst: vi.fn().mockResolvedValue(
          overrides.groupRow === undefined
            ? {
                id: 'group-1',
                publishedAt: null,
                status: ReleaseStatus.PUBLISHING,
                statusTransitions: [],
              }
            : overrides.groupRow,
        ),
        updateMany: vi
          .fn()
          .mockResolvedValue({ count: overrides.groupUpdateCount ?? 1 }),
      };

      return {
        post,
        postGroup,
        prisma: {
          $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
            callback(transactionFixture({ post, postGroup })),
          ),
        },
      };
    };

    const transitionInput = {
      groupId: 'group-1',
      organizationId: 'org-1',
      postId: 'target-1',
      update: {
        executionState: TargetExecutionState.PUBLISHED,
      },
    };

    it('fails loudly when the release row disappeared mid-flight', async () => {
      const { prisma } = buildPrisma({ groupRow: null });
      const service = new SchedulerPublishStateService(
        prisma as never,
        {
          warn: vi.fn(),
        } as never,
        createLifecycleService() as never,
      );

      await expect(service.transition(transitionInput)).rejects.toThrow(
        'Scheduler release group-1 is no longer available.',
      );
    });

    it('fails loudly when the release roll-up matched no row', async () => {
      const { prisma } = buildPrisma({ groupUpdateCount: 0 });
      const service = new SchedulerPublishStateService(
        prisma as never,
        {
          warn: vi.fn(),
        } as never,
        createLifecycleService() as never,
      );

      await expect(service.transition(transitionInput)).rejects.toThrow(
        'Scheduler release group-1 is no longer available.',
      );
    });
  });

  describe('serialization retry budget', () => {
    it('rethrows a non-serialization failure without retrying', async () => {
      const prisma = {
        $transaction: vi.fn().mockRejectedValue(new Error('connection lost')),
      };
      const logger = { warn: vi.fn() };
      const service = new SchedulerPublishStateService(
        prisma as never,
        logger as never,
        createLifecycleService() as never,
      );

      await expect(
        service.transition({
          organizationId: 'org-1',
          postId: 'target-1',
          update: {
            executionState: TargetExecutionState.PUBLISHED,
          },
        }),
      ).rejects.toThrow('connection lost');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('gives up after exhausting the serialization retry budget', async () => {
      const prisma = {
        $transaction: vi.fn().mockRejectedValue({ code: 'P2034' }),
      };
      const logger = { warn: vi.fn() };
      const service = new SchedulerPublishStateService(
        prisma as never,
        logger as never,
        createLifecycleService() as never,
      );

      await expect(
        service.transition({
          groupId: 'group-1',
          organizationId: 'org-1',
          postId: 'target-1',
          update: {
            executionState: TargetExecutionState.PUBLISHED,
          },
        }),
      ).rejects.toEqual({ code: 'P2034' });

      expect(prisma.$transaction).toHaveBeenCalledTimes(3);
      expect(logger.warn).toHaveBeenCalledTimes(2);
    });
  });

  it('delegates channel errors and leaves non-published releases unchanged', async () => {
    const post = {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { targetExecutionState: TargetExecutionState.FAILED },
        ]),
    };
    const postGroup = {
      findFirst: vi.fn().mockResolvedValue({
        id: 'group-1',
        publishedAt: null,
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
        callback(transactionFixture({ post, postGroup })),
      ),
    };
    const postLifecycleService = createLifecycleService();
    const service = new SchedulerPublishStateService(
      prisma as never,
      {
        warn: vi.fn(),
      } as never,
      postLifecycleService as never,
    );

    await service.transition({
      groupId: 'group-1',
      organizationId: 'org-1',
      postId: 'target-1',
      reason: 'Provider rejected the upload',
      update: {
        error: {
          code: 'RATE_LIMIT',
          isRetryable: true,
          message: 'Too many requests',
        },
        executionState: TargetExecutionState.FAILED,
      },
    });

    expect(postLifecycleService.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        error: {
          code: 'RATE_LIMIT',
          isRetryable: true,
          message: 'Too many requests',
        },
        nextState: TargetExecutionState.FAILED,
        organizationId: 'org-1',
        postId: 'target-1',
        reason: 'Provider rejected the upload',
      }),
      expect.objectContaining({ post, postGroup }),
    );
    expect(postGroup.updateMany).not.toHaveBeenCalled();
  });
});

describe('learning publication transaction boundary', () => {
  function harness(overrides: Record<string, unknown> = {}) {
    const initial = publicationPost(overrides);
    let row = structuredClone(initial);
    const trace: string[] = [];
    const tx = transactionFixture();
    tx.post.findFirst = vi.fn(async () => {
      trace.push('post.read');
      return structuredClone(row);
    });
    tx.$queryRaw.mockImplementation(async (sql: TemplateStringsArray) => {
      trace.push(sql.join('?'));
      return [];
    });
    tx.contentLearningAccount.findMany.mockResolvedValue([{ id: 'account-1' }]);
    const lifecycle = {
      transition: vi.fn(async (input) => {
        trace.push('lifecycle');
        Object.assign(
          row,
          input.mutation,
          { targetExecutionState: input.nextState },
          input.visibility ? { visibility: input.visibility } : {},
        );
        return { kind: 'transitioned', target: row };
      }),
    };
    const prisma = {
      $transaction: vi.fn(async (callback) => {
        const prior = structuredClone(row);
        try {
          return await callback(tx);
        } catch (error) {
          row = prior;
          throw error;
        }
      }),
    };
    const logger = { warn: vi.fn() };
    const service = new SchedulerPublishStateService(
      prisma as never,
      logger as never,
      lifecycle as never,
    );
    const input = {
      organizationId: 'org-1',
      postId: 'post-1',
      guard: { priorExecutionStates: [TargetExecutionState.PUBLISHING] },
      update: {
        executionState: TargetExecutionState.PUBLISHED,
        visibility: PostVisibility.PUBLIC,
        externalId: 'provider-1',
        publishedAt: new Date('2026-10-01T01:00:00Z'),
      },
      finalization: {
        result: {
          success: true,
          executionState: TargetExecutionState.PUBLISHED,
          externalId: 'provider-1',
          platform: 'twitter',
          url: 'https://example.com/1',
          learningPublication: { invented: true },
        },
        source: 'provider',
      },
    };
    return { tx, trace, lifecycle, service, input, read: () => row };
  }

  function eligibleContext(h: ReturnType<typeof harness>) {
    const approved = publicationPost({
      publishApprovalId: 'approval-1',
      reviewVersionPinId: 'pin-1',
      externalId: 'provider-1',
      publishedAt: h.input.update.publishedAt,
      targetExecutionState: TargetExecutionState.PUBLISHED,
    });
    const pin = {
      id: 'pin-1',
      organizationId: 'org-1',
      brandId: 'brand-1',
      recordKind: 'post',
      recordId: 'post-1',
      contentDigest: buildArtifactContentDigest({
        ...projectPostArtifactMaterial(approved),
        children: [],
      }),
    };
    const sources = {
      organization: {
        findFirst: vi.fn().mockResolvedValue({ id: 'org-1', isDeleted: false }),
      },
      brand: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'brand-1',
          organizationId: 'org-1',
          isDeleted: false,
          isActive: true,
        }),
      },
      credential: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'cred-1',
          organizationId: 'org-1',
          brandId: 'brand-1',
          isDeleted: false,
          isConnected: true,
          platform: 'twitter',
        }),
      },
      publishApproval: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'approval-1',
          organizationId: 'org-1',
          brandId: 'brand-1',
          postId: 'post-1',
          artifactVersionPinId: 'pin-1',
          operationId: 'operation-1',
          scopeDigest: 'scope',
          status: PublishApprovalStatus.EXECUTING,
          invalidatedAt: null,
        }),
      },
      contentVersionPin: { findFirst: vi.fn().mockResolvedValue(pin) },
    };
    Object.assign(h.tx, sources);
    return { sources, pin };
  }

  it('takes the organization fence first, then existing accounts before scoped source locks and lifecycle', async () => {
    const h = harness();
    await h.service.transition(h.input);
    expect(h.trace[0]).toContain('pg_advisory_xact_lock_shared(5728, 1)');
    expect(h.trace[1]).toContain('pg_advisory_xact_lock(?::int, hashtext(?))');
    expect(h.trace.join('\n')).not.toContain('pg_advisory_xact_lock(5728, 1)');
    const locks = h.trace.filter((value) => value.includes('SELECT id'));
    expect(locks.map((value) => value.match(/FROM (\w+)/)?.[1])).toEqual([
      'content_learning_accounts',
      'organizations',
      'brands',
      'credentials',
      'posts',
      'post_publish_finalizations',
    ]);
    expect(h.trace.indexOf('lifecycle')).toBeGreaterThan(
      h.trace.findIndex((value) =>
        value.includes('post_publish_finalizations'),
      ),
    );
    expect(h.tx.contentLearningAccount.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'account-1',
        organizationId: 'org-1',
        brandId: 'brand-1',
        credentialId: 'cred-1',
        isDeleted: false,
      },
      data: { evidenceRevision: { increment: 1 } },
    });
    expect(h.tx.contentLearningDependency.findMany).toHaveBeenCalledOnce();
    expect(
      h.tx.postPublishFinalization.create.mock.calls[0]?.[0].data.result,
    ).not.toHaveProperty('learningPublication');
  });

  it.each(['wrong', ''])(
    'rejects queried external target %s before lifecycle',
    async (expectedExternalId) => {
      const h = harness({ externalId: 'queried-1' });
      expect(
        await h.service.transition({
          ...h.input,
          guard: { expectedExternalId },
        }),
      ).toBe(false);
      expect(h.lifecycle.transition).not.toHaveBeenCalled();
      expect(h.tx.postPublishFinalization.create).not.toHaveBeenCalled();
      expect(h.tx.contentLearningAccount.updateMany).not.toHaveBeenCalled();
    },
  );

  it('rejects same-state polling under a prior-state guard before timestamp mutation', async () => {
    const publishedAt = new Date('2026-09-01T00:00:00Z');
    const h = harness({
      targetExecutionState: TargetExecutionState.PUBLISHED,
      publishedAt,
      externalId: 'provider-1',
    });
    expect(await h.service.transition(h.input)).toBe(false);
    expect(h.lifecycle.transition).not.toHaveBeenCalled();
    expect(h.read().publishedAt).toEqual(publishedAt);
  });

  it.each([
    {},
    { learningPublication: { old: true } },
    { learningPublication: { different: true } },
  ])(
    'never enriches or rewrites an existing immutable outbox %j',
    async (result) => {
      const h = harness();
      h.tx.postPublishFinalization.findUnique.mockResolvedValue({
        id: 'existing',
        result,
        completedAt: new Date(),
      });
      await h.service.transition(h.input);
      expect(h.tx.postPublishFinalization.create).not.toHaveBeenCalled();
      expect(h.tx.contentLearningAccount.updateMany).toHaveBeenCalledOnce();
    },
  );

  it('does zero evidence writes on factual no-op and operational changes', async () => {
    const h = harness();
    await h.service.transition({
      organizationId: 'org-1',
      postId: 'post-1',
      update: {
        executionState: TargetExecutionState.PUBLISHING,
        retryCount: 1,
        url: 'https://example.com/changed',
      },
    });
    expect(h.tx.contentLearningDependency.findMany).not.toHaveBeenCalled();
    expect(h.tx.contentLearningAccount.updateMany).not.toHaveBeenCalled();
    expect(h.tx.postPublishFinalization.create).not.toHaveBeenCalled();
  });

  it.each(['invalidation', 'counter', 'outbox'])(
    'rolls back lifecycle when required %s bookkeeping fails',
    async (failure) => {
      const h = harness();
      if (failure === 'invalidation')
        h.tx.contentLearningDependency.findMany.mockRejectedValue(
          new Error('invalidation failed'),
        );
      if (failure === 'counter')
        h.tx.contentLearningAccount.updateMany.mockRejectedValue(
          new Error('counter failed'),
        );
      if (failure === 'outbox')
        h.tx.postPublishFinalization.create.mockRejectedValue(
          new Error('outbox failed'),
        );
      await expect(h.service.transition(h.input)).rejects.toThrow(
        `${failure} failed`,
      );
      expect(h.read().targetExecutionState).toBe(
        TargetExecutionState.PUBLISHING,
      );
    },
  );

  it('fails closed if discovered ownership changes instead of expanding account locks', async () => {
    const h = harness();
    h.tx.post.findFirst
      .mockResolvedValueOnce(publicationPost())
      .mockResolvedValueOnce(publicationPost({ brandId: 'foreign-brand' }));
    await expect(h.service.transition(h.input)).rejects.toThrow(
      'Publication source identity changed',
    );
    expect(h.lifecycle.transition).not.toHaveBeenCalled();
  });

  it('creates a real supported text association through the canonical DB loader', async () => {
    const h = harness({
      publishApprovalId: 'approval-1',
      reviewVersionPinId: 'pin-1',
    });
    const { pin } = eligibleContext(h);
    await h.service.transition(h.input);
    expect(
      h.tx.postPublishFinalization.create.mock.calls[0]?.[0].data.result
        .learningPublication,
    ).toEqual(
      expect.objectContaining({
        version: 1,
        postId: 'post-1',
        approvalId: 'approval-1',
        versionPinId: 'pin-1',
        contentDigest: pin.contentDigest,
      }),
    );
    expect(h.tx.contentLearningAccount.updateMany).toHaveBeenCalledOnce();
  });
  it.each([
    'organization',
    'brand',
    'credential',
    'publishApproval',
    'contentVersionPin',
  ] as const)('does not manufacture authority for missing %s', async (kind) => {
    const h = harness({
      publishApprovalId: 'approval-1',
      reviewVersionPinId: 'pin-1',
    });
    const { sources } = eligibleContext(h);
    sources[kind].findFirst.mockResolvedValue(null);
    await h.service.transition(h.input);
    expect(h.tx.postPublishFinalization.create).toHaveBeenCalledOnce();
    expect(
      h.tx.postPublishFinalization.create.mock.calls[0]?.[0].data.result,
    ).not.toHaveProperty('learningPublication');
  });

  it('rejects a foreign credential returned by the source loader without failing genuine publication', async () => {
    const h = harness({
      publishApprovalId: 'approval-1',
      reviewVersionPinId: 'pin-1',
    });
    const { sources } = eligibleContext(h);
    sources.credential.findFirst.mockResolvedValue({
      id: 'cred-1',
      organizationId: 'foreign-org',
      brandId: 'brand-1',
      isDeleted: false,
      isConnected: true,
      platform: 'twitter',
    });
    await h.service.transition(h.input);
    expect(h.tx.postPublishFinalization.create).toHaveBeenCalledOnce();
    expect(
      h.tx.postPublishFinalization.create.mock.calls[0]?.[0].data.result,
    ).not.toHaveProperty('learningPublication');
  });

  it('rejects a replaced workflow before lifecycle even when the state still matches', async () => {
    const h = harness({ workflowExecutionId: 'new-workflow' });
    expect(
      await h.service.transition({
        ...h.input,
        guard: {
          expectedWorkflowExecutionId: 'old-workflow',
          priorExecutionStates: [TargetExecutionState.PUBLISHING],
        },
      }),
    ).toBe(false);
    expect(h.lifecycle.transition).not.toHaveBeenCalled();
    expect(h.tx.contentLearningDependency.findMany).not.toHaveBeenCalled();
  });

  it('preserves ordinary unsupported video finalization without learning authority', async () => {
    const h = harness({ category: PostCategory.VIDEO });
    await h.service.transition(h.input);
    expect(h.tx.postPublishFinalization.create).toHaveBeenCalledOnce();
    expect(
      h.tx.postPublishFinalization.create.mock.calls[0]?.[0].data.result,
    ).not.toHaveProperty('learningPublication');
    expect(h.read().targetExecutionState).toBe(TargetExecutionState.PUBLISHED);
  });

  it('does not backfill an already-public legacy post under an explicitly allowed same-state reconcile', async () => {
    const h = harness({
      targetExecutionState: TargetExecutionState.PUBLISHED,
      externalId: 'provider-1',
      publishedAt: new Date('2026-10-01T01:00:00Z'),
    });
    await h.service.transition({
      ...h.input,
      guard: { priorExecutionStates: [TargetExecutionState.PUBLISHED] },
    });
    expect(h.tx.postPublishFinalization.create).not.toHaveBeenCalled();
    expect(h.tx.contentLearningAccount.updateMany).not.toHaveBeenCalled();
  });

  it('increments a disabled existing account exactly once on a visibility withdrawal', async () => {
    const h = harness({
      targetExecutionState: TargetExecutionState.PUBLISHED,
      externalId: 'provider-1',
      publishedAt: new Date('2026-10-01T01:00:00Z'),
    });
    h.tx.contentLearningAccount.findMany.mockResolvedValue([
      { id: 'disabled-account' },
    ]);
    await h.service.transition({
      organizationId: 'org-1',
      postId: 'post-1',
      update: {
        executionState: TargetExecutionState.PUBLISHED,
        visibility: PostVisibility.PRIVATE,
      },
    });
    expect(h.tx.contentLearningAccount.updateMany).toHaveBeenCalledOnce();
    expect(h.tx.contentLearningDependency.findMany).toHaveBeenCalledOnce();
    expect(h.tx.postPublishFinalization.create).not.toHaveBeenCalled();
  });
});

describe('after-commit publication refresh', () => {
  it('coalesces bounded org/credential refreshes and catches queue failure', async () => {
    const queue = {
      queueSystemWorkflow: vi.fn().mockRejectedValue(new Error('Redis down')),
    };
    const logger = { warn: vi.fn() };
    await queueLearningPublicationRefreshV1(queue as never, logger as never, {
      organizationId: 'org-1',
      credentialId: 'cred-1',
    });
    expect(queue.queueSystemWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: CONTENT_LEARNING_ACTION_IDS.RECONCILE,
        organizationId: 'org-1',
        inputValues: { credentialId: 'cred-1' },
        source: 'publication-learning-refresh',
      }),
      expect.stringMatching(/^learning-materialize-[0-9a-f]{64}$/),
      expect.objectContaining({ attempts: 3 }),
    );
    expect(logger.warn).toHaveBeenCalledOnce();
    await queueLearningPublicationRefreshV1(queue as never, logger as never, {
      organizationId: 'org-1',
      credentialId: null,
    });
    expect(queue.queueSystemWorkflow).toHaveBeenCalledOnce();
  });
});
