import type { PrismaClient } from '@genfeedai/desktop-prisma';
import type { DesktopPrismaService } from './prisma.service';

export interface WorkspaceRow {
  createdAt: string;
  fileIndex: string;
  id: string;
  indexingState: string;
  lastOpenedAt: string;
  linkedProjectId: string | null;
  localDraftCount: number;
  name: string;
  path: string;
  pendingSyncCount: number;
  updatedAt: string;
}

export interface SyncJobRow {
  createdAt: string;
  error: string | null;
  id: string;
  payload: string;
  retryCount: number;
  status: string;
  type: string;
  updatedAt: string;
  workspaceId: string | null;
}

export class DesktopDatabaseService {
  private clientPromise: Promise<PrismaClient> | null = null;

  constructor(private readonly prismaService: DesktopPrismaService) {}

  getDatabasePath(): string {
    return this.prismaService.getDatabasePath();
  }

  async close(): Promise<void> {
    this.clientPromise = null;
    await this.prismaService.close();
  }

  async getValue(key: string): Promise<string | null> {
    const client = await this.getClient();
    const record = await client.desktopKv.findUnique({
      where: { key },
    });

    return record?.value ?? null;
  }

  async setValue(key: string, value: string): Promise<void> {
    const client = await this.getClient();
    await client.desktopKv.upsert({
      create: { key, value },
      update: { value },
      where: { key },
    });
  }

  async deleteValue(key: string): Promise<void> {
    const client = await this.getClient();
    await client.desktopKv.deleteMany({
      where: { key },
    });
  }

  async listWorkspaces(): Promise<WorkspaceRow[]> {
    const client = await this.getClient();
    const rows = await client.desktopWorkspace.findMany({
      orderBy: {
        lastOpenedAt: 'desc',
      },
    });

    return rows.map((row) => ({
      createdAt: row.createdAt,
      fileIndex: row.fileIndex,
      id: row.id,
      indexingState: row.indexingState,
      lastOpenedAt: row.lastOpenedAt,
      linkedProjectId: row.linkedProjectId,
      localDraftCount: row.localDraftCount,
      name: row.name,
      path: row.path,
      pendingSyncCount: row.pendingSyncCount,
      updatedAt: row.updatedAt,
    }));
  }

  async getWorkspaceById(id: string): Promise<WorkspaceRow | null> {
    const client = await this.getClient();
    const row = await client.desktopWorkspace.findUnique({
      where: { id },
    });

    if (!row) {
      return null;
    }

    return {
      createdAt: row.createdAt,
      fileIndex: row.fileIndex,
      id: row.id,
      indexingState: row.indexingState,
      lastOpenedAt: row.lastOpenedAt,
      linkedProjectId: row.linkedProjectId,
      localDraftCount: row.localDraftCount,
      name: row.name,
      path: row.path,
      pendingSyncCount: row.pendingSyncCount,
      updatedAt: row.updatedAt,
    };
  }

  async upsertWorkspace(row: WorkspaceRow): Promise<void> {
    const client = await this.getClient();
    await client.desktopWorkspace.upsert({
      create: {
        createdAt: row.createdAt,
        fileIndex: row.fileIndex,
        id: row.id,
        indexingState: row.indexingState,
        lastOpenedAt: row.lastOpenedAt,
        linkedProjectId: row.linkedProjectId,
        localDraftCount: row.localDraftCount,
        name: row.name,
        path: row.path,
        pendingSyncCount: row.pendingSyncCount,
        updatedAt: row.updatedAt,
      },
      update: {
        fileIndex: row.fileIndex,
        indexingState: row.indexingState,
        lastOpenedAt: row.lastOpenedAt,
        linkedProjectId: row.linkedProjectId,
        localDraftCount: row.localDraftCount,
        name: row.name,
        path: row.path,
        pendingSyncCount: row.pendingSyncCount,
        updatedAt: row.updatedAt,
      },
      where: {
        id: row.id,
      },
    });
  }

  async listSyncJobs(workspaceId?: string): Promise<SyncJobRow[]> {
    const client = await this.getClient();
    const rows = await client.desktopSyncJob.findMany({
      orderBy: {
        updatedAt: 'desc',
      },
      ...(workspaceId
        ? {
            where: {
              workspaceId,
            },
          }
        : {}),
    });

    return rows.map((row) => ({
      createdAt: row.createdAt,
      error: row.error,
      id: row.id,
      payload: row.payload,
      retryCount: row.retryCount,
      status: row.status,
      type: row.type,
      updatedAt: row.updatedAt,
      workspaceId: row.workspaceId,
    }));
  }

  async upsertSyncJob(row: SyncJobRow): Promise<void> {
    const client = await this.getClient();
    await client.desktopSyncJob.upsert({
      create: {
        createdAt: row.createdAt,
        error: row.error,
        id: row.id,
        payload: row.payload,
        retryCount: row.retryCount,
        status: row.status,
        type: row.type,
        updatedAt: row.updatedAt,
        workspaceId: row.workspaceId,
      },
      update: {
        error: row.error,
        payload: row.payload,
        retryCount: row.retryCount,
        status: row.status,
        type: row.type,
        updatedAt: row.updatedAt,
        workspaceId: row.workspaceId,
      },
      where: {
        id: row.id,
      },
    });
  }

  async listRecentItems(): Promise<
    Array<{
      id: string;
      kind: string;
      label: string;
      openedAt: string;
      value: string;
    }>
  > {
    const client = await this.getClient();
    const rows = await client.desktopRecentItem.findMany({
      orderBy: {
        openedAt: 'desc',
      },
      take: 12,
    });

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      label: row.label,
      openedAt: row.openedAt,
      value: row.value,
    }));
  }

  async upsertRecentItem(item: {
    id: string;
    kind: string;
    label: string;
    openedAt: string;
    value: string;
  }): Promise<void> {
    const client = await this.getClient();
    await client.desktopRecentItem.upsert({
      create: {
        id: item.id,
        kind: item.kind,
        label: item.label,
        openedAt: item.openedAt,
        value: item.value,
      },
      update: {
        kind: item.kind,
        label: item.label,
        openedAt: item.openedAt,
        value: item.value,
      },
      where: {
        id: item.id,
      },
    });
  }

  private async getClient(): Promise<PrismaClient> {
    if (!this.clientPromise) {
      this.clientPromise = this.prismaService.getClient();
    }

    return this.clientPromise;
  }
}
