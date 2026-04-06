import { randomUUID } from 'node:crypto';
import type {
  IDesktopSyncJob,
  IDesktopSyncState,
} from '@genfeedai/desktop-contracts';
import type {
  CloudDatabaseService,
  SyncJobRow,
} from './cloud-database.service';

const toIso = (): string => new Date().toISOString();

export class DesktopSyncService {
  constructor(private readonly database: CloudDatabaseService) {}

  private toSyncJob(row: SyncJobRow): IDesktopSyncJob {
    return {
      createdAt: row.createdAt,
      error: row.error ?? undefined,
      id: row.id,
      payload: row.payload,
      retryCount: 0,
      status: row.status as IDesktopSyncJob['status'],
      type: row.type,
      updatedAt: row.updatedAt,
      workspaceId: row.workspaceId ?? undefined,
    };
  }

  listJobs(workspaceId?: string): IDesktopSyncJob[] {
    return this.database
      .listSyncJobs(workspaceId)
      .map((row) => this.toSyncJob(row));
  }

  getState(): IDesktopSyncState {
    const jobs = this.listJobs();

    return {
      failedCount: jobs.filter((job) => job.status === 'failed').length,
      lastSyncAt: jobs[0]?.updatedAt,
      pendingCount: jobs.filter((job) => job.status === 'pending').length,
      retryingCount: 0,
      runningCount: jobs.filter((job) => job.status === 'running').length,
    };
  }

  queueJob(
    type: string,
    payload: string,
    workspaceId?: string,
  ): IDesktopSyncJob {
    const now = toIso();
    const row: SyncJobRow = {
      createdAt: now,
      error: null,
      id: randomUUID(),
      payload,
      status: 'pending',
      type,
      updatedAt: now,
      workspaceId: workspaceId ?? null,
    };

    this.database.upsertSyncJob(row);

    return this.toSyncJob(row);
  }
}
