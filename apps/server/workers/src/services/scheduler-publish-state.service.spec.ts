import {
  PostStatus,
  ReleaseStatus,
  TargetExecutionState,
} from '@genfeedai/enums';
import { SchedulerPublishStateService } from '@workers/services/scheduler-publish-state.service';

describe('SchedulerPublishStateService', () => {
  it('persists a provider outcome and rolls mixed targets up to partial success', async () => {
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
    const service = new SchedulerPublishStateService(
      prisma as never,
      {
        warn: vi.fn(),
      } as never,
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
        status: PostStatus.PUBLIC,
        url: 'https://social.example/provider-1',
      },
    });

    expect(post.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          externalId: 'provider-1',
          publishedAt,
          status: PostStatus.PUBLIC,
          targetExecutionState: TargetExecutionState.PUBLISHED,
          url: 'https://social.example/provider-1',
        }),
        where: expect.objectContaining({
          groupId: 'group-1',
          id: 'target-1',
          organizationId: 'org-1',
        }),
      }),
    );
    expect(postGroup.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          publishedAt: expect.any(Date),
          status: ReleaseStatus.PARTIALLY_PUBLISHED,
          statusTransitions: [
            expect.objectContaining({
              actorId: null,
              from: ReleaseStatus.PUBLISHING,
              to: ReleaseStatus.PARTIALLY_PUBLISHED,
            }),
          ],
        }),
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
    const service = new SchedulerPublishStateService(
      prisma as never,
      logger as never,
    );

    await service.transition({
      groupId: 'group-1',
      organizationId: 'org-1',
      postId: 'target-1',
      update: {
        executionState: TargetExecutionState.PUBLISHED,
        status: PostStatus.PUBLIC,
      },
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('retrying concurrent roll-up'),
      expect.objectContaining({ attempt: 1, groupId: 'group-1' }),
    );
    expect(postGroup.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: ReleaseStatus.PUBLISHED }),
      }),
    );
  });

  it('transitions with canonical tenant identifiers', async () => {
    const service = new SchedulerPublishStateService({} as never, {} as never);
    const transition = vi.spyOn(service, 'transition').mockResolvedValue(true);

    const grouped = await service.transitionPost(
      {
        groupId: 'group-1',
        id: 'post-1',
        organizationId: 'org-1',
      },
      {
        executionState: TargetExecutionState.PUBLISHED,
        status: PostStatus.PUBLIC,
      },
      'Provider confirmed publication',
    );

    expect(grouped).toBe(true);
    expect(transition).toHaveBeenCalledWith({
      groupId: 'group-1',
      guard: undefined,
      organizationId: 'org-1',
      postId: 'post-1',
      reason: 'Provider confirmed publication',
      update: {
        executionState: TargetExecutionState.PUBLISHED,
        status: PostStatus.PUBLIC,
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
    const service = new SchedulerPublishStateService(
      prisma as never,
      { warn: vi.fn() } as never,
    );

    const applied = await service.transitionPost(
      { id: 'legacy-post-1', organizationId: 'org-1' },
      {
        executionState: TargetExecutionState.PUBLISHED,
        status: PostStatus.PUBLIC,
        url: 'https://www.youtube.com/watch?v=video-1',
        workflowExecutionId: 'execution-1',
      },
    );

    expect(applied).toBe(true);
    expect(post.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          url: 'https://www.youtube.com/watch?v=video-1',
          workflowExecutionId: 'execution-1',
        }),
        where: expect.not.objectContaining({ groupId: expect.anything() }),
      }),
    );
    expect(postGroup.findFirst).not.toHaveBeenCalled();
    expect(postGroup.updateMany).not.toHaveBeenCalled();
  });

  it('ignores an outcome from a stale workflow execution', async () => {
    const post = {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    };
    const postGroup = {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    };
    const prisma = {
      $transaction: vi.fn(async (callback) => callback({ post, postGroup })),
    };
    const logger = { warn: vi.fn() };
    const service = new SchedulerPublishStateService(
      prisma as never,
      logger as never,
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
        status: PostStatus.PUBLIC,
      },
    });

    expect(applied).toBe(false);
    expect(post.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          targetExecutionState: { in: [TargetExecutionState.PUBLISHING] },
          workflowExecutionId: 'execution-current',
        }),
      }),
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
      );
      const transition = vi.spyOn(service, 'transition');

      const blank = await service.transitionPost(
        { id: '   ', organizationId: 'org-1' },
        {
          executionState: TargetExecutionState.PUBLISHED,
          status: PostStatus.PUBLIC,
        },
      );
      const opaque = await service.transitionPost(
        { id: 'post-1', organizationId: {} },
        {
          executionState: TargetExecutionState.PUBLISHED,
          status: PostStatus.PUBLIC,
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
          status: PostStatus.PUBLIC,
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
        status: PostStatus.PUBLIC,
      },
    };

    it('fails loudly when the release row disappeared mid-flight', async () => {
      const { prisma } = buildPrisma({ groupRow: null });
      const service = new SchedulerPublishStateService(
        prisma as never,
        {
          warn: vi.fn(),
        } as never,
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
      );

      await expect(service.transition(transitionInput)).rejects.toThrow(
        'Scheduler release group-1 is no longer available.',
      );
    });

    it('rejects a target execution state the release contract does not know', async () => {
      const { prisma } = buildPrisma({
        targets: [{ targetExecutionState: 'NOT_A_REAL_STATE' }],
      });
      const service = new SchedulerPublishStateService(
        prisma as never,
        {
          warn: vi.fn(),
        } as never,
      );

      await expect(service.transition(transitionInput)).rejects.toThrow(
        'Unknown scheduler target execution state: NOT_A_REAL_STATE',
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
      );

      await expect(
        service.transition({
          organizationId: 'org-1',
          postId: 'target-1',
          update: {
            executionState: TargetExecutionState.PUBLISHED,
            status: PostStatus.PUBLIC,
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
      );

      await expect(
        service.transition({
          groupId: 'group-1',
          organizationId: 'org-1',
          postId: 'target-1',
          update: {
            executionState: TargetExecutionState.PUBLISHED,
            status: PostStatus.PUBLIC,
          },
        }),
      ).rejects.toEqual({ code: 'P2034' });

      expect(prisma.$transaction).toHaveBeenCalledTimes(3);
      expect(logger.warn).toHaveBeenCalledTimes(2);
    });
  });

  it('persists a channel error payload and appends to prior transitions', async () => {
    const post = {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { targetExecutionState: TargetExecutionState.FAILED },
        ]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    const postGroup = {
      findFirst: vi.fn().mockResolvedValue({
        id: 'group-1',
        publishedAt: null,
        status: ReleaseStatus.PUBLISHING,
        // Malformed entries must not survive into the appended history.
        statusTransitions: [
          { at: '2026-07-15T00:00:00.000Z', from: null, to: 'PUBLISHING' },
          null,
          'garbage',
          ['nested'],
        ],
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
        callback({ post, postGroup }),
      ),
    };
    const service = new SchedulerPublishStateService(
      prisma as never,
      {
        warn: vi.fn(),
      } as never,
    );

    await service.transition({
      groupId: 'group-1',
      organizationId: 'org-1',
      postId: 'target-1',
      reason: 'Provider rejected the upload',
      update: {
        error: { code: 'RATE_LIMIT', message: 'Too many requests' },
        executionState: TargetExecutionState.FAILED,
        status: PostStatus.FAILED,
      },
    });

    expect(post.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetError: { code: 'RATE_LIMIT', message: 'Too many requests' },
        }),
      }),
    );

    const groupData = postGroup.updateMany.mock.calls[0][0].data;
    expect(groupData.publishedAt).toBeUndefined();
    expect(groupData.statusTransitions).toEqual([
      { at: '2026-07-15T00:00:00.000Z', from: null, to: 'PUBLISHING' },
      expect.objectContaining({
        from: ReleaseStatus.PUBLISHING,
        reason: 'Provider rejected the upload',
        to: ReleaseStatus.FAILED,
      }),
    ]);
  });

  it('treats a non-array transition history as empty', async () => {
    const post = {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { targetExecutionState: TargetExecutionState.PUBLISHED },
        ]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    const postGroup = {
      findFirst: vi.fn().mockResolvedValue({
        id: 'group-1',
        publishedAt: new Date('2026-07-15T00:00:00.000Z'),
        status: ReleaseStatus.PUBLISHING,
        statusTransitions: null,
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
        callback({ post, postGroup }),
      ),
    };
    const service = new SchedulerPublishStateService(
      prisma as never,
      {
        warn: vi.fn(),
      } as never,
    );

    await service.transition({
      groupId: 'group-1',
      organizationId: 'org-1',
      postId: 'target-1',
      update: {
        executionState: TargetExecutionState.PUBLISHED,
        status: PostStatus.PUBLIC,
      },
    });

    const groupData = postGroup.updateMany.mock.calls[0][0].data;
    // publishedAt is already set, so the roll-up must not overwrite it.
    expect(groupData.publishedAt).toBeUndefined();
    expect(groupData.statusTransitions).toEqual([
      expect.objectContaining({
        from: ReleaseStatus.PUBLISHING,
        to: ReleaseStatus.PUBLISHED,
      }),
    ]);
  });
});
