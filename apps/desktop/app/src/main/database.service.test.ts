import { describe, expect, it } from 'bun:test';
import type { SyncJobRow, WorkspaceRow } from './database.service';
import type { DesktopPrismaService } from './prisma.service';
import './test-support/electron.mock';

const { DesktopDatabaseService } = await import('./database.service');

type RecentItemRow = {
  id: string;
  kind: string;
  label: string;
  openedAt: string;
  value: string;
};

const sortByLastOpenedAtDesc = (items: WorkspaceRow[]): WorkspaceRow[] =>
  [...items].sort((left, right) =>
    right.lastOpenedAt.localeCompare(left.lastOpenedAt),
  );

const sortByUpdatedAtDesc = (items: SyncJobRow[]): SyncJobRow[] =>
  [...items].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );

const sortByOpenedAtDesc = (items: RecentItemRow[]): RecentItemRow[] =>
  [...items].sort((left, right) => right.openedAt.localeCompare(left.openedAt));

const createPrismaServiceMock = () => {
  const kv = new Map<string, string>();
  const recentItems = new Map<string, RecentItemRow>();
  const syncJobs = new Map<string, SyncJobRow>();
  const workspaces = new Map<string, WorkspaceRow>();
  let closeCalls = 0;

  const client = {
    desktopKv: {
      deleteMany: async ({ where }: { where: { key: string } }) => {
        kv.delete(where.key);
        return { count: 1 };
      },
      findUnique: async ({ where }: { where: { key: string } }) => {
        const value = kv.get(where.key);
        return value ? { key: where.key, value } : null;
      },
      upsert: async ({
        create,
        update,
        where,
      }: {
        create: { key: string; value: string };
        update: { value: string };
        where: { key: string };
      }) => {
        kv.set(where.key, update.value ?? create.value);
        return null;
      },
    },
    desktopRecentItem: {
      findMany: async () =>
        sortByOpenedAtDesc(Array.from(recentItems.values())).slice(0, 12),
      upsert: async ({
        create,
        update,
        where,
      }: {
        create: RecentItemRow;
        update: Omit<RecentItemRow, 'id'>;
        where: { id: string };
      }) => {
        recentItems.set(where.id, {
          ...(recentItems.get(where.id) ?? create),
          ...update,
          id: where.id,
        });
        return null;
      },
    },
    desktopSyncJob: {
      findMany: async ({ where }: { where?: { workspaceId: string } }) =>
        sortByUpdatedAtDesc(
          Array.from(syncJobs.values()).filter(
            (row) =>
              !where?.workspaceId || row.workspaceId === where.workspaceId,
          ),
        ),
      upsert: async ({
        create,
        update,
        where,
      }: {
        create: SyncJobRow;
        update: Omit<SyncJobRow, 'createdAt' | 'id'>;
        where: { id: string };
      }) => {
        syncJobs.set(where.id, {
          ...(syncJobs.get(where.id) ?? create),
          ...update,
          id: where.id,
        });
        return null;
      },
    },
    desktopWorkspace: {
      findMany: async () =>
        sortByLastOpenedAtDesc(Array.from(workspaces.values())),
      findUnique: async ({ where }: { where: { id: string } }) =>
        workspaces.get(where.id) ?? null,
      upsert: async ({
        create,
        update,
        where,
      }: {
        create: WorkspaceRow;
        update: Omit<WorkspaceRow, 'createdAt' | 'id'>;
        where: { id: string };
      }) => {
        workspaces.set(where.id, {
          ...(workspaces.get(where.id) ?? create),
          ...update,
          id: where.id,
        });
        return null;
      },
    },
  };

  return {
    kv,
    prismaService: {
      close: async () => {
        closeCalls += 1;
      },
      getClient: async () => client,
      getDatabasePath: () => '/tmp/genfeed-desktop/pglite-db',
    },
    recentItems,
    syncJobs,
    workspaces,
    getCloseCalls: () => closeCalls,
  };
};

describe('DesktopDatabaseService', () => {
  it('returns the PGlite path and persists kv values', async () => {
    const prisma = createPrismaServiceMock();
    const service = new DesktopDatabaseService(
      prisma.prismaService as unknown as DesktopPrismaService,
    );

    expect(service.getDatabasePath()).toBe('/tmp/genfeed-desktop/pglite-db');

    await service.setValue('desktop.session', 'token-123');
    await expect(service.getValue('desktop.session')).resolves.toBe(
      'token-123',
    );

    await service.deleteValue('desktop.session');
    await expect(service.getValue('desktop.session')).resolves.toBeNull();
  });

  it('round-trips workspace, sync job, and recents records', async () => {
    const prisma = createPrismaServiceMock();
    const service = new DesktopDatabaseService(
      prisma.prismaService as unknown as DesktopPrismaService,
    );
    const now = '2026-04-01T10:00:00.000Z';

    await service.upsertWorkspace({
      createdAt: now,
      fileIndex: '[]',
      id: 'workspace-1',
      indexingState: 'idle',
      lastOpenedAt: now,
      linkedProjectId: null,
      localDraftCount: 2,
      name: 'Desktop Workspace',
      path: '/tmp/workspace',
      pendingSyncCount: 1,
      updatedAt: now,
    });

    await service.upsertSyncJob({
      createdAt: now,
      error: null,
      id: 'job-1',
      payload: '{"draftId":"draft-1"}',
      retryCount: 0,
      status: 'pending',
      type: 'publish',
      updatedAt: now,
      workspaceId: 'workspace-1',
    });

    await service.upsertRecentItem({
      id: 'workspace-1',
      kind: 'workspace',
      label: 'Desktop Workspace',
      openedAt: now,
      value: '/tmp/workspace',
    });

    expect((await service.getWorkspaceById('workspace-1'))?.name).toBe(
      'Desktop Workspace',
    );
    await expect(service.listWorkspaces()).resolves.toHaveLength(1);
    expect((await service.listSyncJobs('workspace-1'))[0]?.type).toBe(
      'publish',
    );
    expect((await service.listRecentItems())[0]?.value).toBe('/tmp/workspace');
  });

  it('closes the shared prisma service', async () => {
    const prisma = createPrismaServiceMock();
    const service = new DesktopDatabaseService(
      prisma.prismaService as unknown as DesktopPrismaService,
    );

    await service.close();

    expect(prisma.getCloseCalls()).toBe(1);
  });
});
