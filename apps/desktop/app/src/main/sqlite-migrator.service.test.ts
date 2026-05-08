import { afterEach, describe, expect, it, mock } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LegacySqliteReader } from './cloud-database.service';
import { DesktopSqliteMigratorService } from './sqlite-migrator.service';

const cleanupPaths: string[] = [];

afterEach(() => {
  while (cleanupPaths.length > 0) {
    const target = cleanupPaths.pop();

    if (target) {
      fs.rmSync(target, { force: true, recursive: true });
    }
  }

  mock.restore();
});

const createPrismaMock = () => {
  const kv = new Map<string, Record<string, string>>();
  const workspaces = new Map<string, Record<string, unknown>>();
  const syncJobs = new Map<string, Record<string, unknown>>();
  const recents = new Map<string, Record<string, unknown>>();

  const prisma = {
    $transaction: async (
      callback: (tx: typeof prisma) => Promise<void>,
    ): Promise<void> => {
      const kvSnapshot = new Map(kv);
      const workspaceSnapshot = new Map(workspaces);
      const syncSnapshot = new Map(syncJobs);
      const recentSnapshot = new Map(recents);

      try {
        await callback(prisma);
      } catch (error) {
        kv.clear();
        workspaces.clear();
        syncJobs.clear();
        recents.clear();
        for (const [key, value] of kvSnapshot) kv.set(key, value);
        for (const [key, value] of workspaceSnapshot)
          workspaces.set(key, value);
        for (const [key, value] of syncSnapshot) syncJobs.set(key, value);
        for (const [key, value] of recentSnapshot) recents.set(key, value);
        throw error;
      }
    },
    desktopKv: {
      findUnique: async ({ where }: { where: { key: string } }) =>
        kv.get(where.key) ?? null,
      upsert: async ({
        create,
        update,
        where,
      }: {
        create: Record<string, string>;
        update: Record<string, string>;
        where: { key: string };
      }) => {
        kv.set(where.key, {
          ...(kv.get(where.key) ?? create),
          ...update,
          key: where.key,
        });
      },
    },
    desktopRecentItem: {
      upsert: async ({
        create,
        update,
        where,
      }: {
        create: Record<string, unknown>;
        update: Record<string, unknown>;
        where: { id: string };
      }) => {
        recents.set(where.id, {
          ...(recents.get(where.id) ?? create),
          ...update,
          id: where.id,
        });
      },
    },
    desktopSyncJob: {
      upsert: async ({
        create,
        update,
        where,
      }: {
        create: Record<string, unknown>;
        update: Record<string, unknown>;
        where: { id: string };
      }) => {
        syncJobs.set(where.id, {
          ...(syncJobs.get(where.id) ?? create),
          ...update,
          id: where.id,
        });
      },
    },
    desktopWorkspace: {
      upsert: async ({
        create,
        update,
        where,
      }: {
        create: Record<string, unknown>;
        update: Record<string, unknown>;
        where: { id: string };
      }) => {
        workspaces.set(where.id, {
          ...(workspaces.get(where.id) ?? create),
          ...update,
          id: where.id,
        });
      },
    },
    kv,
    recents,
    syncJobs,
    workspaces,
  };

  return prisma;
};

describe('DesktopSqliteMigratorService', () => {
  it('migrates legacy SQLite rows and records the completion flag', async () => {
    const prisma = createPrismaMock();
    const sqlitePath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-sqlite-')),
      'desktop.sqlite',
    );
    cleanupPaths.push(path.dirname(sqlitePath));
    fs.writeFileSync(sqlitePath, '');

    const close = mock(() => {});
    LegacySqliteReader.tryOpen = mock(() => ({
      close,
      readKvStore: () => [{ key: 'desktop.session', value: 'abc' }],
      readRecentItems: () => [
        {
          id: 'recent-1',
          kind: 'workspace',
          label: 'Workspace',
          openedAt: '2026-04-01T09:00:00.000Z',
          value: '/tmp/workspace',
        },
      ],
      readSyncJobs: () => [
        {
          createdAt: '2026-04-01T09:00:00.000Z',
          error: null,
          id: 'job-1',
          payload: '{}',
          retryCount: 0,
          status: 'pending',
          type: 'publish',
          updatedAt: '2026-04-01T09:00:00.000Z',
          workspaceId: null,
        },
      ],
      readWorkspaceRegistry: () => [
        {
          createdAt: '2026-04-01T09:00:00.000Z',
          fileIndex: '[]',
          id: 'workspace-1',
          indexingState: 'idle',
          lastOpenedAt: '2026-04-01T09:00:00.000Z',
          linkedProjectId: null,
          localDraftCount: 0,
          name: 'Workspace',
          path: '/tmp/workspace',
          pendingSyncCount: 0,
          updatedAt: '2026-04-01T09:00:00.000Z',
        },
      ],
    })) as never;

    await DesktopSqliteMigratorService.migrate(prisma as never, sqlitePath);

    expect(prisma.kv.get('desktop.session')?.value).toBe('abc');
    expect(prisma.workspaces.has('workspace-1')).toBe(true);
    expect(prisma.syncJobs.has('job-1')).toBe(true);
    expect(prisma.recents.has('recent-1')).toBe(true);
    expect(prisma.kv.get('sqlite_migration_complete')?.value).toBe('1');
    expect(close).toHaveBeenCalled();
  });

  it('is a no-op after the completion flag has been set', async () => {
    const prisma = createPrismaMock();
    prisma.kv.set('sqlite_migration_complete', {
      key: 'sqlite_migration_complete',
      value: '1',
    });

    const tryOpen = mock(() => null);
    LegacySqliteReader.tryOpen = tryOpen as never;

    await DesktopSqliteMigratorService.migrate(
      prisma as never,
      '/tmp/missing.sqlite',
    );

    expect(tryOpen).not.toHaveBeenCalled();
  });

  it('marks fresh installs complete when the old SQLite file does not exist', async () => {
    const prisma = createPrismaMock();

    await DesktopSqliteMigratorService.migrate(
      prisma as never,
      '/tmp/does-not-exist.sqlite',
    );

    expect(prisma.kv.get('sqlite_migration_complete')?.value).toBe('1');
  });

  it('rolls back partial imports when a write fails', async () => {
    const prisma = createPrismaMock();
    const sqlitePath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-sqlite-rollback-')),
      'desktop.sqlite',
    );
    cleanupPaths.push(path.dirname(sqlitePath));
    fs.writeFileSync(sqlitePath, '');

    LegacySqliteReader.tryOpen = mock(() => ({
      close: () => {},
      readKvStore: () => [{ key: 'desktop.session', value: 'abc' }],
      readRecentItems: () => [],
      readSyncJobs: () => [],
      readWorkspaceRegistry: () => [
        {
          createdAt: '2026-04-01T09:00:00.000Z',
          fileIndex: '[]',
          id: 'workspace-1',
          indexingState: 'idle',
          lastOpenedAt: '2026-04-01T09:00:00.000Z',
          linkedProjectId: null,
          localDraftCount: 0,
          name: 'Workspace',
          path: '/tmp/workspace',
          pendingSyncCount: 0,
          updatedAt: '2026-04-01T09:00:00.000Z',
        },
      ],
    })) as never;

    prisma.desktopWorkspace.upsert = async () => {
      throw new Error('workspace insert failed');
    };

    await expect(
      DesktopSqliteMigratorService.migrate(prisma as never, sqlitePath),
    ).rejects.toThrow('workspace insert failed');
    expect(prisma.kv.size).toBe(0);
    expect(prisma.workspaces.size).toBe(0);
  });
});
