import { randomUUID } from 'node:crypto';
import type {
  IDesktopSyncJob,
  IDesktopSyncState,
} from '@genfeedai/desktop-contracts';
import type { PrismaClient } from '@genfeedai/desktop-prisma';

const toIso = (): string => new Date().toISOString();

export class DesktopSyncService {
  private readonly jobs = new Map<string, IDesktopSyncJob>();

  constructor(private readonly prisma: PrismaClient) {}

  async init(): Promise<void> {
    const rows = await this.prisma.desktopSyncJob.findMany({
      orderBy: {
        updatedAt: 'desc',
      },
    });

    this.jobs.clear();

    for (const row of rows) {
      this.jobs.set(row.id, this.toSyncJob(row));
    }
  }

  private toSyncJob(row: {
    createdAt: string;
    error: string | null;
    id: string;
    payload: string;
    retryCount: number;
    status: string;
    type: string;
    updatedAt: string;
    workspaceId: string | null;
  }): IDesktopSyncJob {
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

  private listJobCache(workspaceId?: string): IDesktopSyncJob[] {
    return Array.from(this.jobs.values())
      .filter((job) => !workspaceId || job.workspaceId === workspaceId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  listJobs(workspaceId?: string): IDesktopSyncJob[] {
    return this.listJobCache(workspaceId);
  }

  getState(): IDesktopSyncState {
    const jobs = this.listJobCache();

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
    const row = {
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

    await this.prisma.desktopSyncJob.upsert({
      create: row,
      update: row,
      where: {
        id: row.id,
      },
    });

    const job = this.toSyncJob(row);
    this.jobs.set(job.id, job);
    return job;
  }
}
