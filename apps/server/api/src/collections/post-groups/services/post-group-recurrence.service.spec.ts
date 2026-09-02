import { PostGroupRecurrenceService } from '@api/collections/post-groups/services/post-group-recurrence.service';
import {
  PostFrequency,
  ReleaseStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { deriveReleaseStatusProjectionFromTargets } from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const organizationId = 'org-1';
const userId = 'user-1';
const rootRecurrence = {
  frequency: PostFrequency.WEEKLY,
  interval: 1,
  isExhausted: false,
  isPaused: false,
  maxRepeats: 4,
  nextRunAt: '2026-08-10T09:00:00.000Z',
  repeatCount: 1,
  weekdays: [1],
};
const root = {
  id: 'release-root',
  recurrence: rootRecurrence,
  scheduledAt: new Date('2026-08-03T09:00:00.000Z'),
  status: ReleaseStatus.PUBLISHED,
  timezone: 'UTC',
};
const future = {
  id: 'release-future',
  recurrence: {
    ...rootRecurrence,
    parentReleaseId: root.id,
  },
  scheduledAt: new Date('2026-08-10T09:00:00.000Z'),
  status: ReleaseStatus.SCHEDULED,
  timezone: 'UTC',
};

describe('PostGroupRecurrenceService', () => {
  const prisma = {
    $transaction: vi.fn(async (operations: unknown[]) =>
      Promise.all(operations),
    ),
    postGroup: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    post: {
      findMany: vi.fn(),
    },
  };
  const contractService = {
    asRecord: vi.fn((value: unknown) => value as Record<string, unknown>),
    deriveReleaseStatus: vi.fn(
      (_releaseId: string, states: readonly unknown[]) =>
        deriveReleaseStatusProjectionFromTargets(states).status,
    ),
    toJson: vi.fn((value: unknown) => value),
  };
  const postGroupsService = {
    cancel: vi.fn(),
    getOne: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    update: vi.fn(),
  };
  let service: PostGroupRecurrenceService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.postGroup.findFirst.mockResolvedValue(root);
    prisma.postGroup.findMany.mockResolvedValue([root, future]);
    prisma.post.findMany.mockResolvedValue([
      {
        groupId: root.id,
        targetExecutionState: TargetExecutionState.PUBLISHED,
      },
      {
        groupId: future.id,
        targetExecutionState: TargetExecutionState.SCHEDULED,
      },
    ]);
    prisma.postGroup.updateMany.mockResolvedValue({ count: 1 });
    postGroupsService.getOne.mockResolvedValue({ id: future.id });
    postGroupsService.pause.mockResolvedValue({ id: future.id });
    postGroupsService.resume.mockResolvedValue({ id: future.id });
    postGroupsService.cancel.mockResolvedValue({ id: future.id });
    postGroupsService.update.mockResolvedValue({ id: future.id });
    service = new PostGroupRecurrenceService(
      prisma as never,
      contractService as never,
      postGroupsService as never,
    );
  });

  it('previews bounded occurrences without writing state', () => {
    const result = service.preview({
      limit: 2,
      recurrence: {
        frequency: PostFrequency.DAILY,
        interval: 1,
        maxRepeats: 2,
      },
      startAt: '2026-08-03T09:00:00.000Z',
      timezone: 'UTC',
    });

    expect(result).toEqual({
      isExhausted: true,
      occurrences: ['2026-08-04T09:00:00.000Z', '2026-08-05T09:00:00.000Z'],
      success: true,
    });
    expect(prisma.postGroup.updateMany).not.toHaveBeenCalled();
  });

  it('pauses only future materialized releases and preserves history', async () => {
    await service.pauseFuture(organizationId, userId, root.id);

    expect(postGroupsService.pause).toHaveBeenCalledWith(
      organizationId,
      userId,
      future.id,
    );
    expect(postGroupsService.pause).not.toHaveBeenCalledWith(
      organizationId,
      userId,
      root.id,
    );
    expect(prisma.postGroup.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          recurrence: expect.objectContaining({
            isPaused: true,
            repeatCount: 1,
          }),
        },
      }),
    );
    expect(postGroupsService.getOne).toHaveBeenCalledWith(
      organizationId,
      future.id,
    );
  });

  it('resumes paused future releases without changing published history', async () => {
    prisma.post.findMany.mockResolvedValue([
      {
        groupId: root.id,
        targetExecutionState: TargetExecutionState.PUBLISHED,
      },
      {
        groupId: future.id,
        targetExecutionState: TargetExecutionState.PAUSED,
      },
    ]);

    await service.resumeFuture(organizationId, userId, root.id);

    expect(postGroupsService.resume).toHaveBeenCalledWith(
      organizationId,
      userId,
      future.id,
    );
    expect(postGroupsService.resume).not.toHaveBeenCalledWith(
      organizationId,
      userId,
      root.id,
    );
  });

  it('cancels future releases and exhausts the complete lineage', async () => {
    await service.cancelFuture(organizationId, userId, root.id);

    expect(postGroupsService.cancel).toHaveBeenCalledTimes(1);
    expect(postGroupsService.cancel).toHaveBeenCalledWith(
      organizationId,
      userId,
      future.id,
    );
    expect(prisma.postGroup.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          recurrence: expect.objectContaining({
            isExhausted: true,
            isPaused: false,
            nextRunAt: null,
          }),
        },
      }),
    );
  });

  it('edits the next occurrence while preserving its source lineage', async () => {
    await service.editFuture(organizationId, userId, root.id, {
      scheduledDate: '2026-08-12T09:00:00.000Z',
    });

    expect(postGroupsService.update).toHaveBeenCalledWith(
      organizationId,
      userId,
      future.id,
      { scheduledDate: '2026-08-12T09:00:00.000Z' },
    );
    expect(prisma.postGroup.updateMany).toHaveBeenLastCalledWith({
      data: {
        recurrence: expect.objectContaining({
          parentReleaseId: root.id,
          repeatCount: 1,
        }),
      },
      where: expect.objectContaining({
        id: future.id,
        organizationId,
      }),
    });
  });

  it('fails closed when the selected release is outside the organization', async () => {
    prisma.postGroup.findFirst.mockResolvedValue(null);

    await expect(
      service.pauseFuture(organizationId, userId, root.id),
    ).rejects.toThrow('The scheduled release is unavailable.');
    expect(prisma.postGroup.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: root.id,
          organizationId,
        }),
      }),
    );
    expect(prisma.postGroup.updateMany).not.toHaveBeenCalled();
  });
});
