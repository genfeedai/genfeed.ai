import { PostGroupReopenService } from '@api/collections/post-groups/services/post-group-reopen.service';
import { TargetExecutionState } from '@genfeedai/contracts';
import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

vi.mock(
  '@api/collections/post-groups/services/post-group-attachment-sync',
  () => ({
    syncReleaseAttachmentPosts: vi.fn().mockResolvedValue(undefined),
  }),
);

interface FakeTarget {
  id: string;
  executionState: TargetExecutionState;
}

/** A release whose targets keep their state, so the outcome is what a reader sees. */
function createFakeRelease(initial: TargetExecutionState[]) {
  const targets: FakeTarget[] = initial.map((executionState, index) => ({
    executionState,
    id: `target-${index + 1}`,
  }));
  const snapshot = () => ({
    id: 'group-1',
    targets: targets.map((t) => ({ ...t })),
  });
  const postGroupsService = {
    getOne: vi.fn(async () => snapshot()),
    scheduleTarget: vi.fn(
      async (_org: string, _user: string, _group: string, targetId: string) => {
        const target = targets.find((t) => t.id === targetId);
        if (target) target.executionState = TargetExecutionState.SCHEDULED;
        return snapshot();
      },
    ),
    transitionGroupTargets: vi.fn(
      async (
        _org: string,
        _user: string,
        _group: string,
        next: TargetExecutionState,
        from: readonly TargetExecutionState[],
      ) => {
        for (const target of targets) {
          if (from.includes(target.executionState))
            target.executionState = next;
        }
        return snapshot();
      },
    ),
  };
  const persistenceService = {
    getGroupOrThrow: vi.fn(async () => ({ id: 'group-1' })),
    getTargets: vi.fn(async () => targets),
  };
  const prisma = {
    $transaction: vi.fn(async (run: (tx: unknown) => unknown) => run({})),
  };
  const contractService = {
    parseFutureScheduleDate: vi.fn((value: string) => {
      if (Date.parse(value) <= Date.now()) throw new Error('past');
      return new Date(value);
    }),
    readScheduledDate: vi.fn(
      (body: { scheduledDate: string }) => body.scheduledDate,
    ),
  };
  const service = new PostGroupReopenService(
    prisma as never,
    postGroupsService as never,
    persistenceService as never,
    contractService as never,
  );
  return { service, targets };
}

describe('PostGroupReopenService', () => {
  it('brings a cancelled target back as a draft on the same release', async () => {
    const { service } = createFakeRelease([TargetExecutionState.CANCELLED]);

    const release = await service.reopen('org-1', 'user-1', 'group-1');

    expect(release.id).toBe('group-1');
    expect(release.targets?.map((t) => t.executionState)).toEqual([
      TargetExecutionState.DRAFT,
    ]);
  });

  it('leaves targets that were not cancelled as they are', async () => {
    const { service } = createFakeRelease([
      TargetExecutionState.CANCELLED,
      TargetExecutionState.PUBLISHED,
    ]);

    const release = await service.reopen('org-1', 'user-1', 'group-1');

    expect(release.targets?.map((t) => t.executionState)).toEqual([
      TargetExecutionState.DRAFT,
      TargetExecutionState.PUBLISHED,
    ]);
  });

  it('schedules the reopened target again when given a future time', async () => {
    const { service } = createFakeRelease([TargetExecutionState.CANCELLED]);

    const release = await service.reopen('org-1', 'user-1', 'group-1', {
      scheduledDate: new Date(Date.now() + 86_400_000).toISOString(),
    });

    expect(release.targets?.map((t) => t.executionState)).toEqual([
      TargetExecutionState.SCHEDULED,
    ]);
  });

  it('refuses a time that has already passed and keeps the target cancelled', async () => {
    const { service, targets } = createFakeRelease([
      TargetExecutionState.CANCELLED,
    ]);

    await expect(
      service.reopen('org-1', 'user-1', 'group-1', {
        scheduledDate: '2020-01-01T00:00:00.000Z',
      }),
    ).rejects.toThrow('past');
    expect(targets.map((t) => t.executionState)).toEqual([
      TargetExecutionState.CANCELLED,
    ]);
  });

  it('refuses a release that has no cancelled post', async () => {
    const { service } = createFakeRelease([TargetExecutionState.SCHEDULED]);

    await expect(
      service.reopen('org-1', 'user-1', 'group-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
