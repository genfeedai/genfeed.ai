import { InvalidChannelTargetScheduleException } from '@api/collections/posts/services/channel-target-schedule-validation.util';
import {
  canTransitionPostLifecycle,
  POST_LIFECYCLE_TRANSITIONS,
  PostLifecycleService,
} from '@api/post-lifecycle/post-lifecycle.service';
import {
  CredentialPlatform,
  PostCategory,
  PostStatus,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { ConflictException, HttpStatus } from '@nestjs/common';

const target = {
  brandId: 'brand-1',
  groupId: 'group-1',
  id: 'post-1',
  isDeleted: false,
  organizationId: 'org-1',
  status: PostStatus.SCHEDULED,
  targetExecutionState: TargetExecutionState.SCHEDULED,
  updatedAt: new Date('2026-08-08T20:00:00.000Z'),
  workflowExecutionId: 'workflow-1',
};

function createTransaction(overrides?: {
  current?: typeof target | null;
  updateCount?: number;
}) {
  const current =
    overrides && 'current' in overrides ? overrides.current : target;
  const findFirst = current
    ? vi
        .fn()
        .mockResolvedValueOnce(current)
        .mockResolvedValue({
          ...target,
          status: PostStatus.PROCESSING,
          targetExecutionState: TargetExecutionState.PUBLISHING,
        })
    : vi.fn().mockResolvedValue(null);
  return {
    activity: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
    post: {
      findFirst,
      updateMany: vi
        .fn()
        .mockResolvedValue({ count: overrides?.updateCount ?? 1 }),
    },
  };
}

describe('PostLifecycleService', () => {
  it('defines every allowed and denied target edge explicitly', () => {
    const expected: Readonly<
      Record<TargetExecutionState, ReadonlySet<TargetExecutionState>>
    > = {
      [TargetExecutionState.CANCELLED]: new Set(),
      [TargetExecutionState.DRAFT]: new Set([
        TargetExecutionState.CANCELLED,
        TargetExecutionState.FAILED,
        TargetExecutionState.PUBLISHING,
        TargetExecutionState.SCHEDULED,
      ]),
      [TargetExecutionState.FAILED]: new Set([
        TargetExecutionState.CANCELLED,
        TargetExecutionState.DRAFT,
        TargetExecutionState.SCHEDULED,
      ]),
      [TargetExecutionState.PAUSED]: new Set([
        TargetExecutionState.CANCELLED,
        TargetExecutionState.DRAFT,
        TargetExecutionState.SCHEDULED,
      ]),
      [TargetExecutionState.PUBLISHED]: new Set(),
      [TargetExecutionState.PUBLISHING]: new Set([
        TargetExecutionState.CANCELLED,
        TargetExecutionState.FAILED,
        TargetExecutionState.PUBLISHED,
        TargetExecutionState.SCHEDULED,
      ]),
      [TargetExecutionState.SCHEDULED]: new Set([
        TargetExecutionState.CANCELLED,
        TargetExecutionState.DRAFT,
        TargetExecutionState.FAILED,
        TargetExecutionState.PAUSED,
        TargetExecutionState.PUBLISHING,
      ]),
      [TargetExecutionState.SKIPPED]: new Set(),
    };

    for (const from of Object.values(TargetExecutionState)) {
      for (const to of Object.values(TargetExecutionState)) {
        expect(canTransitionPostLifecycle(from, to)).toBe(
          from === to || expected[from].has(to),
        );
      }
      expect([...POST_LIFECYCLE_TRANSITIONS[from]]).toEqual([
        ...expected[from],
      ]);
    }

    expect(
      canTransitionPostLifecycle(
        TargetExecutionState.SCHEDULED,
        TargetExecutionState.PUBLISHING,
      ),
    ).toBe(true);
    expect(
      canTransitionPostLifecycle(
        TargetExecutionState.PUBLISHED,
        TargetExecutionState.DRAFT,
      ),
    ).toBe(false);
  });

  it('persists the state and audit entry through the same transaction client', async () => {
    const transaction = createTransaction();
    const prisma = {
      $transaction: vi.fn(async (callback) => callback(transaction)),
    };
    const service = new PostLifecycleService(
      prisma as never,
      { warn: vi.fn() } as never,
    );

    const result = await service.transition({
      actorId: 'user-1',
      groupId: 'group-1',
      mutation: { lastAttemptAt: new Date('2026-08-08T20:01:00.000Z') },
      nextState: TargetExecutionState.PUBLISHING,
      organizationId: 'org-1',
      postId: 'post-1',
      reason: 'Provider execution started',
      visibility: PostVisibility.PRIVATE,
    });

    expect(result.kind).toBe('transitioned');
    expect(transaction.post.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetExecutionState: TargetExecutionState.PUBLISHING,
          visibility: PostVisibility.PRIVATE,
        }),
        where: expect.objectContaining({
          groupId: 'group-1',
          id: 'post-1',
          isDeleted: false,
          organizationId: 'org-1',
          targetExecutionState: TargetExecutionState.SCHEDULED,
        }),
      }),
    );
    expect(transaction.activity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'post.lifecycle.transition',
        entityId: 'post-1',
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    });
    const persistedData = transaction.post.updateMany.mock.calls[0]?.[0]?.data;
    expect(persistedData).not.toHaveProperty('status');
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('rolls the state change back when the audit insert fails', async () => {
    const durableState = { ...target };
    const transaction = {
      activity: {
        create: vi.fn().mockRejectedValue(new Error('audit store unavailable')),
      },
      post: {
        findFirst: vi.fn().mockImplementation(() => ({ ...durableState })),
        updateMany: vi.fn().mockImplementation(({ data }) => {
          Object.assign(durableState, data, {
            updatedAt: new Date('2026-08-08T20:02:00.000Z'),
          });
          return { count: 1 };
        }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback) => {
        const before = { ...durableState };
        try {
          return await callback(transaction);
        } catch (error: unknown) {
          Object.assign(durableState, before);
          throw error;
        }
      }),
    };
    const service = new PostLifecycleService(
      prisma as never,
      {
        warn: vi.fn(),
      } as never,
    );

    await expect(
      service.transition({
        nextState: TargetExecutionState.PUBLISHING,
        organizationId: 'org-1',
        postId: 'post-1',
      }),
    ).rejects.toThrow('audit store unavailable');

    expect(durableState.targetExecutionState).toBe(
      TargetExecutionState.SCHEDULED,
    );
    expect(durableState.status).toBe(PostStatus.SCHEDULED);
  });

  it('treats an exact same-state retry as idempotent without a duplicate audit', async () => {
    const transaction = createTransaction();
    const service = new PostLifecycleService(
      {} as never,
      {
        warn: vi.fn(),
      } as never,
    );

    const result = await service.transition(
      {
        nextState: TargetExecutionState.SCHEDULED,
        organizationId: 'org-1',
        postId: 'post-1',
      },
      transaction as never,
    );

    expect(result.kind).toBe('idempotent');
    expect(transaction.post.updateMany).not.toHaveBeenCalled();
    expect(transaction.activity.create).not.toHaveBeenCalled();
  });

  it('updates same-state provider metadata without appending another transition audit', async () => {
    const transaction = createTransaction({
      current: {
        ...target,
        status: PostStatus.PROCESSING,
        targetExecutionState: TargetExecutionState.PUBLISHING,
      },
    });
    const service = new PostLifecycleService(
      {} as never,
      {
        warn: vi.fn(),
      } as never,
    );

    const result = await service.transition(
      {
        mutation: { externalId: 'provider-pending-1' },
        nextState: TargetExecutionState.PUBLISHING,
        organizationId: 'org-1',
        postId: 'post-1',
        visibility: PostVisibility.UNLISTED,
      },
      transaction as never,
    );

    expect(result.kind).toBe('idempotent');
    expect(transaction.post.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          externalId: 'provider-pending-1',
          visibility: PostVisibility.UNLISTED,
        }),
        where: expect.objectContaining({
          isDeleted: false,
          organizationId: 'org-1',
          targetExecutionState: TargetExecutionState.PUBLISHING,
          updatedAt: target.updatedAt,
        }),
      }),
    );
    expect(transaction.activity.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid edge without changing state or appending audit', async () => {
    const transaction = createTransaction({
      current: {
        ...target,
        status: PostStatus.PUBLIC,
        targetExecutionState: TargetExecutionState.PUBLISHED,
      },
    });
    const service = new PostLifecycleService(
      {} as never,
      {
        warn: vi.fn(),
      } as never,
    );

    await expect(
      service.transition(
        {
          nextState: TargetExecutionState.DRAFT,
          organizationId: 'org-1',
          postId: 'post-1',
        },
        transaction as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.post.updateMany).not.toHaveBeenCalled();
    expect(transaction.activity.create).not.toHaveBeenCalled();
  });

  it('uses the same not-found response for missing and cross-tenant targets', async () => {
    const transaction = createTransaction({ current: null });
    const service = new PostLifecycleService(
      {} as never,
      {
        warn: vi.fn(),
      } as never,
    );

    await expect(
      service.transition(
        {
          nextState: TargetExecutionState.PUBLISHING,
          organizationId: 'foreign-org',
          postId: 'post-1',
        },
        transaction as never,
      ),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    expect(transaction.post.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'post-1',
        isDeleted: false,
        organizationId: 'foreign-org',
      }),
    });
    expect(transaction.post.updateMany).not.toHaveBeenCalled();
    expect(transaction.activity.create).not.toHaveBeenCalled();
  });

  it('treats a repeated cancellation of a soft-deleted review target as idempotent', async () => {
    const tombstone = {
      ...target,
      isDeleted: true,
      targetExecutionState: TargetExecutionState.CANCELLED,
    };
    const transaction = createTransaction({ current: null });
    transaction.post.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(tombstone);
    const service = new PostLifecycleService(
      {} as never,
      {
        warn: vi.fn(),
      } as never,
    );

    const result = await service.transition(
      {
        nextState: TargetExecutionState.CANCELLED,
        organizationId: 'org-1',
        postId: 'post-1',
      },
      transaction as never,
    );

    expect(result).toEqual({ kind: 'idempotent', target: tombstone });
    expect(transaction.post.updateMany).not.toHaveBeenCalled();
    expect(transaction.activity.create).not.toHaveBeenCalled();
  });

  it('returns stale when an execution guard no longer matches', async () => {
    const transaction = createTransaction();
    const logger = { warn: vi.fn() };
    const service = new PostLifecycleService({} as never, logger as never);

    const result = await service.transition(
      {
        guard: { expectedWorkflowExecutionId: 'workflow-stale' },
        nextState: TargetExecutionState.PUBLISHING,
        organizationId: 'org-1',
        postId: 'post-1',
      },
      transaction as never,
    );

    expect(result).toEqual({ kind: 'stale' });
    expect(transaction.post.updateMany).not.toHaveBeenCalled();
    expect(transaction.activity.create).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'Ignored stale Post lifecycle transition',
      expect.objectContaining({ reason: 'workflow_execution_mismatch' }),
    );
  });

  describe('channel target validation choke point (#5193)', () => {
    const schedulableTarget = {
      ...target,
      category: PostCategory.TEXT,
      credentialId: 'credential-1',
      description: 'A caption',
      platform: CredentialPlatform.YOUTUBE,
      targetExecutionState: TargetExecutionState.DRAFT,
      targetSettings: {},
      visibility: null,
    };

    function createSchedulingTransaction(
      current: typeof schedulableTarget,
      ingredients: readonly { id: string }[] = [],
    ) {
      const findFirst = vi
        .fn()
        .mockResolvedValueOnce(current)
        .mockResolvedValueOnce({ ingredients })
        .mockResolvedValue({
          ...current,
          targetExecutionState: TargetExecutionState.SCHEDULED,
        });
      return {
        activity: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
        post: {
          findFirst,
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };
    }

    it('rejects scheduling a target whose content fails the channel contract', async () => {
      // YouTube requires video media; this target has none.
      const transaction = createSchedulingTransaction(schedulableTarget, []);
      const service = new PostLifecycleService(
        {} as never,
        { warn: vi.fn() } as never,
      );

      await expect(
        service.transition(
          {
            nextState: TargetExecutionState.SCHEDULED,
            organizationId: 'org-1',
            postId: 'post-1',
          },
          transaction as never,
        ),
      ).rejects.toBeInstanceOf(InvalidChannelTargetScheduleException);
      expect(transaction.post.updateMany).not.toHaveBeenCalled();
      expect(transaction.activity.create).not.toHaveBeenCalled();
    });

    it('schedules a target whose content satisfies the channel contract', async () => {
      const transaction = createSchedulingTransaction(
        { ...schedulableTarget, category: PostCategory.VIDEO },
        [{ id: 'ingredient-1' }],
      );
      const service = new PostLifecycleService(
        {} as never,
        { warn: vi.fn() } as never,
      );

      const result = await service.transition(
        {
          nextState: TargetExecutionState.SCHEDULED,
          organizationId: 'org-1',
          postId: 'post-1',
        },
        transaction as never,
      );

      expect(result.kind).toBe('transitioned');
      expect(transaction.post.updateMany).toHaveBeenCalled();
    });

    it('re-validates an already-scheduled target when the credential swaps and its media no longer resolves', async () => {
      // Already SCHEDULED on YouTube; the mutation swaps the credential, and
      // the freshly-loaded ingredients row (a separate fetch, since ingredient
      // changes aren't part of the mutation) comes back empty — the same
      // shape a credential swap that drops the account's media would take.
      const alreadyScheduled = {
        ...schedulableTarget,
        category: PostCategory.VIDEO,
        targetExecutionState: TargetExecutionState.SCHEDULED,
      };
      const transaction = createSchedulingTransaction(alreadyScheduled, []);
      const service = new PostLifecycleService(
        {} as never,
        { warn: vi.fn() } as never,
      );

      await expect(
        service.transition(
          {
            mutation: { credentialId: 'credential-2' },
            nextState: TargetExecutionState.SCHEDULED,
            organizationId: 'org-1',
            postId: 'post-1',
          },
          transaction as never,
        ),
      ).rejects.toBeInstanceOf(InvalidChannelTargetScheduleException);
      expect(transaction.post.updateMany).not.toHaveBeenCalled();
    });

    it('does not validate a target that has no platform assigned yet', async () => {
      const draftTarget = { ...target };
      const transaction = createTransaction({ current: draftTarget });
      const service = new PostLifecycleService(
        {} as never,
        { warn: vi.fn() } as never,
      );

      const result = await service.transition(
        {
          nextState: TargetExecutionState.SCHEDULED,
          organizationId: 'org-1',
          postId: 'post-1',
        },
        transaction as never,
      );

      // `target` fixture is already SCHEDULED with no platform: idempotent,
      // and — critically — no second `findFirst` call for ingredients.
      expect(result.kind).toBe('idempotent');
      expect(transaction.post.findFirst).toHaveBeenCalledTimes(1);
    });
  });
});
