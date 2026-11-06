import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { Prisma } from '@genfeedai/prisma';
import { WorkspaceInboxReadService } from './workspace-inbox-read.service';

const updatedAt = new Date('2026-10-05T10:00:00.000Z');
const version = { taskId: 'task-1', seenUpdatedAt: updatedAt.toISOString() };

interface TaskRow {
  id: string;
  isDeleted: boolean;
  organizationId: string;
  updatedAt: Date;
}

interface ReadRow {
  isDeleted: boolean;
  organizationId: string;
  seenUpdatedAt: Date;
  taskId: string;
  userId: string;
}

interface ReadWhere {
  isDeleted: boolean;
  organizationId: string;
  task: { isDeleted: boolean; organizationId: string };
  userId: string;
}

interface TaskWhere {
  id: { in: string[] };
  isDeleted: boolean;
  organizationId: string;
}

// The inbox tables as the service sees them. Raw SQL statements land in
// `writes` (the upsert) and `countQueries` (the unread count) unexecuted.
function createDatabase() {
  const db = {
    countQueries: [] as Prisma.Sql[],
    reads: [] as ReadRow[],
    taskLookups: 0,
    tasks: [
      {
        id: 'task-1',
        isDeleted: false,
        organizationId: 'org-1',
        updatedAt,
      },
    ] as TaskRow[],
    unreadCount: 1,
    writes: [] as Prisma.Sql[],
  };
  const taskById = (id: string) => db.tasks.find((task) => task.id === id);
  const prisma = {
    $executeRaw: async (statement: Prisma.Sql) => {
      db.writes.push(statement);
      return 1;
    },
    $queryRaw: async (statement: Prisma.Sql) => {
      db.countQueries.push(statement);
      return [{ unreadCount: db.unreadCount }];
    },
    task: {
      findMany: async ({ where }: { where: TaskWhere }) => {
        db.taskLookups += 1;
        return db.tasks
          .filter(
            (task) =>
              where.id.in.includes(task.id) &&
              task.organizationId === where.organizationId &&
              task.isDeleted === where.isDeleted,
          )
          .map(({ id, updatedAt: taskUpdatedAt }) => ({
            id,
            updatedAt: taskUpdatedAt,
          }));
      },
    },
    workspaceInboxRead: {
      findMany: async ({ where }: { where: ReadWhere }) =>
        db.reads
          .filter((read) => {
            const task = taskById(read.taskId);
            return (
              read.organizationId === where.organizationId &&
              read.userId === where.userId &&
              read.isDeleted === where.isDeleted &&
              task?.organizationId === where.task.organizationId &&
              task.isDeleted === where.task.isDeleted
            );
          })
          .map(({ seenUpdatedAt, taskId }) => ({ seenUpdatedAt, taskId })),
    },
  };
  return {
    db,
    service: new WorkspaceInboxReadService(prisma as unknown as PrismaService),
  };
}

const read = (overrides: Partial<ReadRow> = {}): ReadRow => ({
  isDeleted: false,
  organizationId: 'org-1',
  seenUpdatedAt: updatedAt,
  taskId: 'task-1',
  userId: 'user-1',
  ...overrides,
});

describe('WorkspaceInboxReadService', () => {
  it('lists only the receipts of this user and organization on live tasks', async () => {
    const { db, service } = createDatabase();
    db.tasks.push(
      {
        id: 'task-deleted',
        isDeleted: true,
        organizationId: 'org-1',
        updatedAt,
      },
      {
        id: 'task-foreign',
        isDeleted: false,
        organizationId: 'org-2',
        updatedAt,
      },
    );
    db.reads.push(
      read(),
      read({ userId: 'user-2' }),
      read({ isDeleted: true }),
      read({ taskId: 'task-deleted' }),
      read({ organizationId: 'org-2', taskId: 'task-foreign' }),
    );

    await expect(service.list('org-1', 'user-1')).resolves.toEqual({
      id: 'org-1',
      reads: [version],
      unreadCount: 1,
    });
    expect(db.taskLookups).toBe(0);
  });

  it('skips the receipt list for the count-only rail poll', async () => {
    const { db, service } = createDatabase();
    db.reads.push(read());

    await expect(
      service.list('org-1', 'user-1', { countOnly: true }),
    ).resolves.toEqual({ id: 'org-1', reads: [], unreadCount: 1 });
    expect(db.countQueries).toHaveLength(1);
  });

  it('saves a validated displayed version in one write', async () => {
    const { db, service } = createDatabase();

    await service.markRead('org-1', 'user-1', [version]);

    expect(db.writes).toHaveLength(1);
    expect(db.writes[0].values).toContainEqual(updatedAt);
  });

  it('marks all read with one write, without loading the queue', async () => {
    const { db, service } = createDatabase();

    await service.markAllRead('org-1', 'user-1');

    expect(db.writes).toHaveLength(1);
    expect(db.taskLookups).toBe(0);
  });

  it.each([
    ['a task from another organization', 'org-2', false],
    ['a deleted task', 'org-1', true],
  ])('rejects %s without writing', async (_case, organizationId, isDeleted) => {
    const { db, service } = createDatabase();
    db.tasks = [{ id: 'task-1', isDeleted, organizationId, updatedAt }];

    await expect(
      service.markRead('org-1', 'user-1', [version]),
    ).rejects.toThrow('Invalid workspace inbox task version');
    expect(db.writes).toEqual([]);
  });

  it('rejects a version newer than the task without writing', async () => {
    const { db, service } = createDatabase();

    await expect(
      service.markRead('org-1', 'user-1', [
        { ...version, seenUpdatedAt: '2026-10-05T10:01:00.000Z' },
      ]),
    ).rejects.toThrow('Invalid workspace inbox task version');
    expect(db.writes).toEqual([]);
  });

  it('acknowledges an older displayed version', async () => {
    const { db, service } = createDatabase();
    const older = new Date('2026-10-05T09:59:00.000Z');

    await service.markRead('org-1', 'user-1', [
      { ...version, seenUpdatedAt: older.toISOString() },
    ]);

    expect(db.writes).toHaveLength(1);
    expect(db.writes[0].values).toContainEqual(older);
  });
});
