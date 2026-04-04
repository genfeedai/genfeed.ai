import { describe, expect, it } from 'bun:test';
import type { DesktopDatabaseService, SyncJobRow } from './database.service';
import { DesktopSyncService } from './sync.service';

const createDatabaseMock = (rows: SyncJobRow[] = []) => {
  const syncJobs = new Map(rows.map((row) => [row.id, row]));

  return {
    listSyncJobs: (workspaceId?: string) =>
      Array.from(syncJobs.values())
        .filter((row) => !workspaceId || row.workspaceId === workspaceId)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    syncJobs,
    upsertSyncJob: (row: SyncJobRow) => {
      syncJobs.set(row.id, row);
    },
  };
};

describe('DesktopSyncService', () => {
  it('queues pending jobs for a workspace', () => {
    const database = createDatabaseMock();
    const service = new DesktopSyncService(
      database as unknown as DesktopDatabaseService,
    );

    const job = service.queueJob('publish', '{"draftId":"draft-1"}', 'ws-1');

    expect(job.status).toBe('pending');
    expect(job.type).toBe('publish');
    expect(job.workspaceId).toBe('ws-1');
    expect(database.syncJobs.get(job.id)?.payload).toBe(
      '{"draftId":"draft-1"}',
    );
  });

  it('summarizes sync state from persisted jobs', () => {
    const database = createDatabaseMock([
      {
        createdAt: '2026-04-01T09:00:00.000Z',
        error: null,
        id: 'job-running',
        payload: '{}',
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
        status: 'pending',
        type: 'publish',
        updatedAt: '2026-04-01T09:30:00.000Z',
        workspaceId: 'ws-2',
      },
    ]);

    const service = new DesktopSyncService(
      database as unknown as DesktopDatabaseService,
    );

    expect(service.getState()).toEqual({
      failedCount: 1,
      lastSyncAt: '2026-04-01T11:00:00.000Z',
      pendingCount: 1,
      retryingCount: 0,
      runningCount: 1,
    });
  });
});
