import {
  PostVisibility,
  ReleaseStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { SchedulerPublishStateService } from '@workers/services/scheduler-publish-state.service';

function createLifecycleService(
  kind: 'stale' | 'transitioned' = 'transitioned',
) {
  return {
    transition: vi
      .fn()
      .mockResolvedValue(
        kind === 'stale' ? { kind } : { kind, target: { id: 'target-1' } },
      ),
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
      $transaction: vi.fn(async (callback) => callback({ post, postGroup })),
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
      isolationLevel: 'Serializable',
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
          callback({ post, postGroup }),
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
      $transaction: vi.fn(async (callback) => callback({ post, postGroup })),
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
      create: vi.fn().mockResolvedValue({ id: 'finalization-1' }),
    };
    const prisma = {
      $transaction: vi.fn(async (callback) =>
        callback({ post, postGroup, postPublishFinalization }),
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
        visibility: PostVisibility.PUBLIC,
      },
      'Provider confirmed publication',
      {
        priorExecutionStates: [TargetExecutionState.PUBLISHING],
      },
      {
        result: {
          executionState: TargetExecutionState.PUBLISHED,
          platform: 'tiktok',
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

  it('persists provider URLs and workflow provenance for legacy ungrouped posts', async () => {
    const post = {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    const postGroup = {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    };
    const prisma = {
      $transaction: vi.fn(async (callback) => callback({ post, postGroup })),
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
      $transaction: vi.fn(async (callback) => callback({ post, postGroup })),
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
            callback({ post, postGroup }),
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
        callback({ post, postGroup }),
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
