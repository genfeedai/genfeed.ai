import { assertStrategyCadenceAdmission } from '@api/collections/posts/services/post-strategy-cadence-admission.util';
import { TargetExecutionState } from '@genfeedai/contracts';
import type { AgentStrategy, Prisma } from '@genfeedai/prisma';

describe('strategy scheduling admission', () => {
  const now = new Date('2026-10-08T12:00:00Z');
  const candidate = {
    id: 'new-post',
    agentStrategyId: 'strategy',
    brandId: 'brand',
    organizationId: 'organization',
    targetExecutionState: TargetExecutionState.SCHEDULED,
    scheduledDate: now,
  };
  function database(
    rows: Array<{
      id: string;
      groupId?: string;
      scheduledDate: Date;
      publishedAt?: Date;
    }> = [],
  ) {
    const events: string[] = [];
    const tx = {
      $queryRaw: vi.fn(async () => {
        events.push('lock');
        return [];
      }),
      agentStrategy: {
        findFirst: vi.fn(
          async (): Promise<Pick<AgentStrategy, 'config'> | null> => {
            events.push('configuration');
            return {
              config: {
                postsPerWeek: 1,
                publishingCeilingPerWeek: 2,
                readyDraftReserve: 3,
                timezone: 'Europe/Malta',
              },
            };
          },
        ),
      },
      post: {
        findMany: vi.fn(async () => {
          events.push('capacity');
          return rows;
        }),
      },
    };
    return { tx: tx as unknown as Prisma.TransactionClient, mocks: tx, events };
  }

  it('reads configuration and complete-week capacity only after its transaction lock', async () => {
    const db = database([
      { id: 'future', scheduledDate: new Date('2026-10-10T12:00:00Z') },
    ]);
    await assertStrategyCadenceAdmission(db.tx, candidate);
    expect(db.events).toEqual(['lock', 'configuration', 'capacity']);
    expect(db.mocks.agentStrategy.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'strategy',
          brandId: 'brand',
          organizationId: 'organization',
          isDeleted: false,
        },
      }),
    );
    expect(db.mocks.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'organization',
          isDeleted: false,
          parentId: null,
          agentStrategyId: 'strategy',
          OR: expect.arrayContaining([
            {
              scheduledDate: {
                gte: new Date('2026-10-04T22:00:00Z'),
                lt: new Date('2026-10-11T22:00:00Z'),
              },
            },
          ]),
        }),
      }),
    );
  });

  it('rejects a new content group at the ceiling, while allowing a fan-out sibling', async () => {
    const db = database([
      { id: 'one', groupId: 'one-group', scheduledDate: now },
      { id: 'two', groupId: 'two-group', scheduledDate: now },
    ]);
    await expect(
      assertStrategyCadenceAdmission(db.tx, candidate),
    ).rejects.toThrow('publishing ceiling');
    await expect(
      assertStrategyCadenceAdmission(db.tx, {
        ...candidate,
        groupId: 'one-group',
      }),
    ).resolves.toBeUndefined();
  });

  it('does not double-count fan-out, rescheduling the same post or thread children', async () => {
    const db = database([
      { id: 'one', groupId: 'one-group', scheduledDate: now },
      { id: 'two', groupId: 'one-group', scheduledDate: now },
    ]);
    await assertStrategyCadenceAdmission(db.tx, candidate);
    const full = database([
      { id: 'one', scheduledDate: now },
      { id: 'new-post', scheduledDate: now },
    ]);
    await assertStrategyCadenceAdmission(full.tx, candidate);
    await assertStrategyCadenceAdmission(full.tx, {
      ...candidate,
      parentId: 'parent',
    });
    expect(full.mocks.post.findMany).toHaveBeenCalledTimes(1);
  });

  it('preserves legacy admission and avoids new queries for ordinary drafts', async () => {
    const db = database();
    db.mocks.agentStrategy.findFirst.mockResolvedValueOnce({
      config: { postsPerWeek: 1 },
    });
    await assertStrategyCadenceAdmission(db.tx, candidate);
    await assertStrategyCadenceAdmission(db.tx, {
      ...candidate,
      targetExecutionState: TargetExecutionState.DRAFT,
    });
    expect(db.mocks.post.findMany).not.toHaveBeenCalled();
    expect(db.mocks.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('fails closed for foreign or missing strategy scope and incomplete capacity', async () => {
    const db = database();
    db.mocks.agentStrategy.findFirst.mockResolvedValueOnce(null);
    await expect(
      assertStrategyCadenceAdmission(db.tx, candidate),
    ).rejects.toThrow('unavailable in this brand');
    const truncated = database(
      Array.from({ length: 1001 }, (_, index) => ({
        id: String(index),
        groupId: 'shared',
        scheduledDate: now,
      })),
    );
    await expect(
      assertStrategyCadenceAdmission(truncated.tx, candidate),
    ).rejects.toThrow('publishing ceiling');
  });
});
