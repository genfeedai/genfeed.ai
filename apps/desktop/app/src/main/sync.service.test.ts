import { describe, expect, it } from 'bun:test';
import { DesktopSyncService } from './sync.service';

const createPrismaMock = (rows: Array<Record<string, unknown>> = []) => {
  const assets = new Map<string, Record<string, unknown>>();
  const brands = new Map<string, Record<string, unknown>>();
  const syncJobs = new Map(rows.map((row) => [String(row.id), row]));
  const syncOps = new Map<string, Record<string, unknown>>();

  return {
    desktopAsset: {
      findMany: async () =>
        Array.from(assets.values()).sort((left, right) =>
          String(right.updatedAt).localeCompare(String(left.updatedAt)),
        ),
      upsert: async ({
        create,
        update,
        where,
      }: {
        create: Record<string, unknown>;
        update: Record<string, unknown>;
        where: { id: string };
      }) => {
        assets.set(where.id, {
          ...(assets.get(where.id) ?? create),
          ...update,
          id: where.id,
        });
      },
    },
    desktopBrand: {
      findMany: async () =>
        Array.from(brands.values()).sort((left, right) =>
          String(right.updatedAt).localeCompare(String(left.updatedAt)),
        ),
      deleteMany: async () => undefined,
      upsert: async ({
        create,
        update,
        where,
      }: {
        create: Record<string, unknown>;
        update: Record<string, unknown>;
        where: { id: string };
      }) => {
        brands.set(where.id, {
          ...(brands.get(where.id) ?? create),
          ...update,
          id: where.id,
        });
      },
    },
    desktopSyncJob: {
      findMany: async ({ where }: { where?: { workspaceId?: string } } = {}) =>
        Array.from(syncJobs.values())
          .filter(
            (row) =>
              !where?.workspaceId || row.workspaceId === where.workspaceId,
          )
          .sort((left, right) =>
            String(right.updatedAt).localeCompare(String(left.updatedAt)),
          ),
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
    desktopSyncOp: {
      findMany: async ({ where }: { where?: { workspaceId?: string } } = {}) =>
        Array.from(syncOps.values())
          .filter(
            (row) =>
              !where?.workspaceId || row.workspaceId === where.workspaceId,
          )
          .sort((left, right) =>
            String(right.updatedAt).localeCompare(String(left.updatedAt)),
          ),
      updateMany: async ({
        data,
        where,
      }: {
        data: Record<string, unknown>;
        where: { id: string };
      }) => {
        const existing = syncOps.get(where.id);
        if (existing) {
          syncOps.set(where.id, { ...existing, ...data });
        }
      },
      upsert: async ({
        create,
        update,
        where,
      }: {
        create: Record<string, unknown>;
        update: Record<string, unknown>;
        where: { id: string };
      }) => {
        syncOps.set(where.id, {
          ...(syncOps.get(where.id) ?? create),
          ...update,
          id: where.id,
        });
      },
    },
    assets,
    brands,
    syncJobs,
    syncOps,
  };
};

describe('DesktopSyncService', () => {
  it('queues pending jobs for a workspace', async () => {
    const prisma = createPrismaMock();
    const service = new DesktopSyncService(prisma as never);
    await service.init();

    const job = await service.queueJob(
      'publish',
      '{"draftId":"draft-1"}',
      'ws-1',
    );

    expect(job.status).toBe('pending');
    expect(job.type).toBe('publish');
    expect(job.workspaceId).toBe('ws-1');
    expect(job.retryCount).toBe(0);
    expect(prisma.syncJobs.get(job.id)?.payload).toBe('{"draftId":"draft-1"}');
  });

  it('summarizes sync state from the persisted cache', async () => {
    const prisma = createPrismaMock([
      {
        createdAt: '2026-04-01T09:00:00.000Z',
        error: null,
        id: 'job-running',
        payload: '{}',
        retryCount: 1,
        status: 'running',
        type: 'sync',
        updatedAt: '2026-04-01T11:00:00.000Z',
        workspaceId: 'ws-1',
      },
      {
        createdAt: '2026-04-01T08:00:00.000Z',
        error: 'timeout',
        id: 'job-failed',
        payload: '{}',
        retryCount: 2,
        status: 'failed',
        type: 'publish',
        updatedAt: '2026-04-01T10:00:00.000Z',
        workspaceId: 'ws-1',
      },
      {
        createdAt: '2026-04-01T07:00:00.000Z',
        error: null,
        id: 'job-pending',
        payload: '{}',
        retryCount: 0,
        status: 'pending',
        type: 'publish',
        updatedAt: '2026-04-01T09:30:00.000Z',
        workspaceId: 'ws-2',
      },
    ]);

    const service = new DesktopSyncService(prisma as never);
    await service.init();

    expect(service.getState()).toEqual({
      failedCount: 1,
      lastSyncAt: '2026-04-01T11:00:00.000Z',
      pendingAssetCount: 0,
      pendingCount: 1,
      retryingCount: 0,
      runningCount: 1,
    });
  });
});
