import type { PostGroupContractService } from '@api/collections/post-groups/services/post-group-contract.service';
import { PostGroupRecurrenceService } from '@api/collections/post-groups/services/post-group-recurrence.service';
import type { PostGroupsService } from '@api/collections/post-groups/services/post-groups.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { PostFrequency, TargetExecutionState } from '@genfeedai/contracts';
import { deriveReleaseStatusProjectionFromTargets } from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';

interface Group {
  createdAt: Date;
  id: string;
  isDeleted: boolean;
  organizationId: string;
  recurrence: Record<string, unknown>;
  scheduledAt: Date | null;
  timezone: string;
}

interface Target {
  groupId: string;
  id: string;
  organizationId: string;
  parentId: string | null;
  targetExecutionState: TargetExecutionState;
}

interface GroupWhere {
  OR?: (
    | { id: string }
    | { recurrence: { equals: string; path: ['parentReleaseId'] } }
  )[];
  id?: string;
  isDeleted: boolean;
  organizationId: string;
}

const ORG = 'org-1';
const USER = 'user-1';
const ROOT = 'release-root';
const NEXT = 'release-next';

const rule = {
  frequency: PostFrequency.WEEKLY,
  interval: 1,
  isExhausted: false,
  isPaused: false,
  maxRepeats: 4,
  nextRunAt: '2026-08-17T09:00:00.000Z',
  repeatCount: 1,
  weekdays: [1],
};

const matchesGroup = (group: Group, where: GroupWhere) =>
  group.organizationId === where.organizationId &&
  group.isDeleted === where.isDeleted &&
  (where.id === undefined || group.id === where.id) &&
  (where.OR === undefined ||
    where.OR.some((clause) =>
      'id' in clause
        ? group.id === clause.id
        : group.recurrence.parentReleaseId === clause.recurrence.equals,
    ));

describe('PostGroupRecurrenceService', () => {
  let groups: Group[];
  let targets: Target[];
  let service: PostGroupRecurrenceService;

  const group = (id: string, fields: Partial<Group> = {}): Group => ({
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    id,
    isDeleted: false,
    organizationId: ORG,
    recurrence: { ...rule, parentReleaseId: ROOT },
    scheduledAt: new Date('2026-08-10T09:00:00.000Z'),
    timezone: 'UTC',
    ...fields,
  });
  const target = (groupId: string, state: TargetExecutionState): Target => ({
    groupId,
    id: `${groupId}-target-${targets.length}`,
    organizationId: ORG,
    parentId: null,
    targetExecutionState: state,
  });
  const statesOf = (groupId: string) =>
    targets
      .filter((row) => row.groupId === groupId)
      .map((row) => row.targetExecutionState);
  const recurrenceOf = (groupId: string) =>
    groups.find((row) => row.id === groupId)?.recurrence;

  beforeEach(() => {
    // A published root release and its next scheduled occurrence.
    groups = [
      group(ROOT, {
        recurrence: { ...rule },
        scheduledAt: new Date('2026-08-03T09:00:00.000Z'),
      }),
      group(NEXT),
    ];
    targets = [];
    targets.push(
      target(ROOT, TargetExecutionState.PUBLISHED),
      target(NEXT, TargetExecutionState.SCHEDULED),
    );

    const byScheduleThenCreation = (a: Group, b: Group) =>
      (a.scheduledAt?.getTime() ?? 0) - (b.scheduledAt?.getTime() ?? 0) ||
      a.createdAt.getTime() - b.createdAt.getTime();
    const prisma = {
      $transaction: (operations: Promise<unknown>[]) => Promise.all(operations),
      post: {
        findMany: async ({
          where,
        }: {
          where: { groupId: { in: string[] }; organizationId: string };
        }) =>
          targets.filter(
            (row) =>
              row.organizationId === where.organizationId &&
              row.parentId === null &&
              where.groupId.in.includes(row.groupId),
          ),
      },
      postGroup: {
        findFirst: async ({ where }: { where: GroupWhere }) =>
          groups.find((row) => matchesGroup(row, where)) ?? null,
        findMany: async ({ where }: { where: GroupWhere }) =>
          groups
            .filter((row) => matchesGroup(row, where))
            .sort(byScheduleThenCreation),
        updateMany: async ({
          data,
          where,
        }: {
          data: Pick<Group, 'recurrence'>;
          where: GroupWhere;
        }) => {
          const rows = groups.filter((row) => matchesGroup(row, where));
          for (const row of rows) {
            row.recurrence = data.recurrence;
          }
          return { count: rows.length };
        },
      },
    } as unknown as PrismaService;
    const contract = {
      asRecord: (value: unknown) =>
        value && typeof value === 'object' ? value : {},
      deriveReleaseStatus: (_id: string, states: readonly unknown[]) =>
        deriveReleaseStatusProjectionFromTargets(states).status,
      toJson: (value: unknown) => value,
    } as unknown as PostGroupContractService;

    // Release lifecycle moves of one group's targets.
    const move = (
      groupId: string,
      from: TargetExecutionState[],
      to: TargetExecutionState,
    ) => {
      for (const row of targets) {
        if (
          row.groupId === groupId &&
          from.includes(row.targetExecutionState)
        ) {
          row.targetExecutionState = to;
        }
      }
    };
    const postGroups = {
      cancel: async (_org: string, _user: string, id: string) =>
        move(
          id,
          [
            TargetExecutionState.DRAFT,
            TargetExecutionState.PAUSED,
            TargetExecutionState.SCHEDULED,
          ],
          TargetExecutionState.CANCELLED,
        ),
      getOne: async (_org: string, id: string) => ({ id }),
      pause: async (_org: string, _user: string, id: string) =>
        move(id, [TargetExecutionState.SCHEDULED], TargetExecutionState.PAUSED),
      resume: async (_org: string, _user: string, id: string) =>
        move(id, [TargetExecutionState.PAUSED], TargetExecutionState.SCHEDULED),
      update: async (
        _org: string,
        _user: string,
        id: string,
        input: { scheduledDate?: string },
      ) => {
        const row = groups.find((candidate) => candidate.id === id);
        if (row && input.scheduledDate) {
          row.scheduledAt = new Date(input.scheduledDate);
        }
      },
    } as unknown as PostGroupsService;

    service = new PostGroupRecurrenceService(prisma, contract, postGroups);
  });

  it('previews bounded occurrences without writing state', () => {
    expect(
      service.preview({
        limit: 2,
        recurrence: {
          frequency: PostFrequency.DAILY,
          interval: 1,
          maxRepeats: 2,
        },
        startAt: '2026-08-03T09:00:00.000Z',
        timezone: 'UTC',
      }),
    ).toEqual({
      isExhausted: true,
      occurrences: ['2026-08-04T09:00:00.000Z', '2026-08-05T09:00:00.000Z'],
      success: true,
    });
    expect(recurrenceOf(ROOT)).toEqual(rule);
  });

  it('pauses the future occurrence, marks the lineage paused and keeps history', async () => {
    await expect(service.pauseFuture(ORG, USER, ROOT)).resolves.toEqual({
      id: NEXT,
    });

    expect(statesOf(ROOT)).toEqual([TargetExecutionState.PUBLISHED]);
    expect(statesOf(NEXT)).toEqual([TargetExecutionState.PAUSED]);
    expect(recurrenceOf(ROOT)).toEqual({ ...rule, isPaused: true });
    expect(recurrenceOf(NEXT)).toEqual({
      ...rule,
      isPaused: true,
      parentReleaseId: ROOT,
    });
  });

  it('resumes a paused future occurrence from any release in the series', async () => {
    await service.pauseFuture(ORG, USER, ROOT);

    await expect(service.resumeFuture(ORG, USER, NEXT)).resolves.toEqual({
      id: NEXT,
    });

    expect(statesOf(ROOT)).toEqual([TargetExecutionState.PUBLISHED]);
    expect(statesOf(NEXT)).toEqual([TargetExecutionState.SCHEDULED]);
    expect(recurrenceOf(ROOT)).toMatchObject({ isPaused: false });
  });

  it('cancels the future occurrence and exhausts the whole lineage', async () => {
    await service.cancelFuture(ORG, USER, ROOT);

    expect(statesOf(ROOT)).toEqual([TargetExecutionState.PUBLISHED]);
    expect(statesOf(NEXT)).toEqual([TargetExecutionState.CANCELLED]);
    expect([recurrenceOf(ROOT), recurrenceOf(NEXT)]).toEqual([
      expect.objectContaining({
        isExhausted: true,
        isPaused: false,
        nextRunAt: null,
      }),
      expect.objectContaining({
        isExhausted: true,
        isPaused: false,
        nextRunAt: null,
        parentReleaseId: ROOT,
      }),
    ]);
  });

  it('moves the next occurrence and recomputes its next run, keeping its lineage', async () => {
    await expect(
      service.editFuture(ORG, USER, ROOT, {
        scheduledDate: '2026-08-12T09:00:00.000Z',
      }),
    ).resolves.toEqual({ id: NEXT });

    expect(groups[1]?.scheduledAt).toEqual(
      new Date('2026-08-12T09:00:00.000Z'),
    );
    expect(recurrenceOf(NEXT)).toEqual({
      ...rule,
      isExhausted: false,
      isPaused: false,
      nextRunAt: '2026-08-17T09:00:00.000Z',
      parentReleaseId: ROOT,
    });
    expect(recurrenceOf(ROOT)).toEqual(rule);
  });

  it('refuses an edit once no occurrence is left to edit', async () => {
    await service.cancelFuture(ORG, USER, ROOT);

    await expect(
      service.editFuture(ORG, USER, ROOT, {
        scheduledDate: '2026-08-12T09:00:00.000Z',
      }),
    ).rejects.toThrow(
      'This evergreen series has no editable future occurrence.',
    );
  });

  it('refuses an invalid edit before touching the series', async () => {
    await expect(
      service.editFuture(ORG, USER, ROOT, { scheduledDate: 42 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(groups[1]?.scheduledAt).toEqual(
      new Date('2026-08-10T09:00:00.000Z'),
    );
  });

  it.each([
    [
      'another organization release',
      'org-2',
      ROOT,
      'The scheduled release is unavailable.',
    ],
    [
      'a release outside any series',
      ORG,
      'release-single',
      'This scheduled release is not an evergreen series.',
    ],
  ])('refuses to pause %s', async (_case, organizationId, groupId, message) => {
    groups.push(group('release-single', { recurrence: {} }));
    targets.push(target('release-single', TargetExecutionState.SCHEDULED));

    await expect(
      service.pauseFuture(organizationId, USER, groupId),
    ).rejects.toEqual(new ConflictException(message));
    expect(targets.map((row) => row.targetExecutionState)).toEqual([
      TargetExecutionState.PUBLISHED,
      TargetExecutionState.SCHEDULED,
      TargetExecutionState.SCHEDULED,
    ]);
    expect(recurrenceOf(ROOT)).toEqual(rule);
  });
});
