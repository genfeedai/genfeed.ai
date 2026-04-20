import { randomUUID } from 'node:crypto';
import type {
  IDesktopSyncJob,
  IDesktopSyncState,
} from '@genfeedai/desktop-contracts';
import type { DesktopDatabaseService, SyncJobRow } from './database.service';

const toIso = (): string => new Date().toISOString();

export class DesktopSyncService {
  constructor(private readonly database: DesktopDatabaseService) {}

  private toSyncJob(row: SyncJobRow): IDesktopSyncJob {
    return {
      createdAt: row.createdAt,
      error: row.error ?? undefined,
      id: row.id,
      payload: row.payload,
      retryCount: row.retryCount,
      status: row.status as IDesktopSyncJob['status'],
      type: row.type,
      updatedAt: row.updatedAt,
      workspaceId: row.workspaceId ?? undefined,
    };
  }

  async listJobs(workspaceId?: string): Promise<IDesktopSyncJob[]> {
    const rows = await this.database.listSyncJobs(workspaceId);
    return rows.map((row) => this.toSyncJob(row));
  }

  async getState(): Promise<IDesktopSyncState> {
    const jobs = await this.listJobs();

    return {
      failedCount: jobs.filter((job) => job.status === 'failed').length,
      lastSyncAt: jobs[0]?.updatedAt,
      pendingCount: jobs.filter((job) => job.status === 'pending').length,
      retryingCount: 0,
      runningCount: jobs.filter((job) => job.status === 'running').length,
    };
  }

  async queueJob(
    type: string,
    payload: string,
    workspaceId?: string,
  ): Promise<IDesktopSyncJob> {
    const now = toIso();
    const row: SyncJobRow = {
      createdAt: now,
      error: null,
      id: randomUUID(),
      payload,
      retryCount: 0,
      status: 'pending',
      type,
      updatedAt: now,
      workspaceId: workspaceId ?? null,
    };

    await this.database.upsertSyncJob(row);
    return this.toSyncJob(row);
  }
}
