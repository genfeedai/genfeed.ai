import {
  PostStatus,
  ReleaseStatus,
  TargetExecutionState,
} from '@genfeedai/enums';
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
        status: PostStatus.PUBLIC,
        url: 'https://social.example/provider-1',
      },
    });

    expect(postLifecycleService.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        legacyStatus: PostStatus.PUBLIC,
        mutation: expect.objectContaining({
          externalId: 'provider-1',
          publishedAt,
          url: 'https://social.example/provider-1',
        }),
        nextState: TargetExecutionState.PUBLISHED,
        organizationId: 'org-1',
        postId: 'target-1',
      }),
      expect.objectContaining({ post, postGroup }),
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
        status: PostStatus.PUBLIC,
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
        status: PostStatus.PUBLIC,
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
});
