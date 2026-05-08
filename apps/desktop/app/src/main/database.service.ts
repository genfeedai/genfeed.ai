import type {
  IDesktopAsset,
  IDesktopAssetSyncUpdate,
  IDesktopBrand,
  IDesktopSyncOpAck,
} from '@genfeedai/desktop-contracts';
import type { PrismaClient } from '@genfeedai/desktop-prisma';
import type { DesktopPrismaService } from './prisma.service';

export interface WorkspaceRow {
  createdAt: string;
  fileIndex: string;
  id: string;
  indexingState: string;
  lastOpenedAt: string;
  linkedBrandId: string | null;
  linkedProjectId: string | null;
  localDraftCount: number;
  name: string;
  path: string;
  pendingSyncCount: number;
  syncPolicy: string;
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

export interface SyncOpRow {
  acknowledgedAt: string | null;
  baseVersion: string | null;
  createdAt: string;
  entityId: string;
  entityType: string;
  error: string | null;
  id: string;
  operation: string;
  payload: string;
  retryCount: number;
  status: string;
  updatedAt: string;
  workspaceId: string | null;
}

export interface OrganizationRow {
  cloudId: string | null;
  createdAt: string;
  id: string;
  name: string;
  slug: string;
  updatedAt: string;
}

export interface IngredientRow {
  brandId: string | null;
  content: string;
  createdAt: string;
  id: string;
  organizationId: string;
  platform: string | null;
  sourceContentItemId: string | null;
  title: string;
  totalVotes: number;
  updatedAt: string;
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
      linkedBrandId: row.linkedBrandId,
      linkedProjectId: row.linkedProjectId,
      localDraftCount: row.localDraftCount,
      name: row.name,
      path: row.path,
      pendingSyncCount: row.pendingSyncCount,
      syncPolicy: row.syncPolicy,
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
      linkedBrandId: row.linkedBrandId,
      linkedProjectId: row.linkedProjectId,
      localDraftCount: row.localDraftCount,
      name: row.name,
      path: row.path,
      pendingSyncCount: row.pendingSyncCount,
      syncPolicy: row.syncPolicy,
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
        linkedBrandId: row.linkedBrandId,
        linkedProjectId: row.linkedProjectId,
        localDraftCount: row.localDraftCount,
        name: row.name,
        path: row.path,
        pendingSyncCount: row.pendingSyncCount,
        syncPolicy: row.syncPolicy,
        updatedAt: row.updatedAt,
      },
      update: {
        fileIndex: row.fileIndex,
        indexingState: row.indexingState,
        lastOpenedAt: row.lastOpenedAt,
        linkedBrandId: row.linkedBrandId,
        linkedProjectId: row.linkedProjectId,
        localDraftCount: row.localDraftCount,
        name: row.name,
        path: row.path,
        pendingSyncCount: row.pendingSyncCount,
        syncPolicy: row.syncPolicy,
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

  async listBrands(): Promise<IDesktopBrand[]> {
    const client = await this.getClient();
    const rows = await client.desktopBrand.findMany({
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return rows.map((row) => ({
      cloudId: row.cloudId ?? undefined,
      cloudVersion: row.cloudVersion ?? undefined,
      createdAt: row.createdAt,
      id: row.id,
      lastPulledAt: row.lastPulledAt ?? undefined,
      name: row.name,
      organizationId: row.organizationId,
      slug: row.slug,
      syncPolicy: row.syncPolicy as IDesktopBrand['syncPolicy'],
      updatedAt: row.updatedAt,
    }));
  }

  async upsertOrganization(row: OrganizationRow): Promise<void> {
    const client = await this.getClient();
    await client.desktopOrganization.upsert({
      create: row,
      update: {
        cloudId: row.cloudId,
        name: row.name,
        slug: row.slug,
        updatedAt: row.updatedAt,
      },
      where: {
        id: row.id,
      },
    });
  }

  async upsertBrand(brand: IDesktopBrand): Promise<void> {
    const client = await this.getClient();
    await client.desktopBrand.upsert({
      create: {
        cloudId: brand.cloudId ?? null,
        cloudVersion: brand.cloudVersion ?? null,
        createdAt: brand.createdAt,
        id: brand.id,
        lastPulledAt: brand.lastPulledAt ?? null,
        name: brand.name,
        organizationId: brand.organizationId,
        slug: brand.slug,
        syncPolicy: brand.syncPolicy,
        updatedAt: brand.updatedAt,
      },
      update: {
        cloudId: brand.cloudId ?? null,
        cloudVersion: brand.cloudVersion ?? null,
        lastPulledAt: brand.lastPulledAt ?? null,
        name: brand.name,
        slug: brand.slug,
        syncPolicy: brand.syncPolicy,
        updatedAt: brand.updatedAt,
      },
      where: {
        id: brand.id,
      },
    });
  }

  async deleteBrand(id: string): Promise<void> {
    const client = await this.getClient();
    await client.desktopBrand.deleteMany({
      where: {
        id,
      },
    });
  }

  async upsertIngredient(row: IngredientRow): Promise<void> {
    const client = await this.getClient();
    await client.desktopIngredient.upsert({
      create: row,
      update: {
        brandId: row.brandId,
        content: row.content,
        organizationId: row.organizationId,
        platform: row.platform,
        sourceContentItemId: row.sourceContentItemId,
        title: row.title,
        totalVotes: row.totalVotes,
        updatedAt: row.updatedAt,
      },
      where: {
        id: row.id,
      },
    });
  }

  async deleteIngredient(id: string): Promise<void> {
    const client = await this.getClient();
    await client.desktopIngredient.deleteMany({
      where: {
        id,
      },
    });
  }

  async listAssets(workspaceId?: string): Promise<IDesktopAsset[]> {
    const client = await this.getClient();
    const rows = await client.desktopAsset.findMany({
      orderBy: {
        updatedAt: 'desc',
      },
      where: {
        deletedAt: null,
        ...(workspaceId ? { workspaceId } : {}),
      },
    });

    return rows.map((row) => ({
      brandId: row.brandId ?? undefined,
      cloudId: row.cloudId ?? undefined,
      cloudObjectKey: row.cloudObjectKey ?? undefined,
      createdAt: row.createdAt,
      deletedAt: row.deletedAt ?? undefined,
      displayName: row.displayName,
      id: row.id,
      kind: row.kind as IDesktopAsset['kind'],
      localPath: row.localPath ?? undefined,
      mimeType: row.mimeType,
      organizationId: row.organizationId,
      origin: row.origin as IDesktopAsset['origin'],
      originalFileName: row.originalFileName,
      residency: row.residency as IDesktopAsset['residency'],
      sha256: row.sha256,
      sizeBytes: row.sizeBytes,
      updatedAt: row.updatedAt,
      uploadPolicy: row.uploadPolicy as IDesktopAsset['uploadPolicy'],
      workspaceId: row.workspaceId ?? undefined,
    }));
  }

  async getAsset(assetId: string): Promise<IDesktopAsset | null> {
    const client = await this.getClient();
    const row = await client.desktopAsset.findUnique({
      where: {
        id: assetId,
      },
    });

    if (!row) {
      return null;
    }

    return {
      brandId: row.brandId ?? undefined,
      cloudId: row.cloudId ?? undefined,
      cloudObjectKey: row.cloudObjectKey ?? undefined,
      createdAt: row.createdAt,
      deletedAt: row.deletedAt ?? undefined,
      displayName: row.displayName,
      id: row.id,
      kind: row.kind as IDesktopAsset['kind'],
      localPath: row.localPath ?? undefined,
      mimeType: row.mimeType,
      organizationId: row.organizationId,
      origin: row.origin as IDesktopAsset['origin'],
      originalFileName: row.originalFileName,
      residency: row.residency as IDesktopAsset['residency'],
      sha256: row.sha256,
      sizeBytes: row.sizeBytes,
      updatedAt: row.updatedAt,
      uploadPolicy: row.uploadPolicy as IDesktopAsset['uploadPolicy'],
      workspaceId: row.workspaceId ?? undefined,
    };
  }

  async upsertAsset(asset: IDesktopAsset): Promise<void> {
    const client = await this.getClient();
    await client.desktopAsset.upsert({
      create: {
        brandId: asset.brandId ?? null,
        cloudId: asset.cloudId ?? null,
        cloudObjectKey: asset.cloudObjectKey ?? null,
        createdAt: asset.createdAt,
        deletedAt: asset.deletedAt ?? null,
        displayName: asset.displayName,
        id: asset.id,
        kind: asset.kind,
        localPath: asset.localPath ?? null,
        mimeType: asset.mimeType,
        organizationId: asset.organizationId,
        origin: asset.origin,
        originalFileName: asset.originalFileName,
        residency: asset.residency,
        sha256: asset.sha256,
        sizeBytes: asset.sizeBytes,
        updatedAt: asset.updatedAt,
        uploadPolicy: asset.uploadPolicy,
        workspaceId: asset.workspaceId ?? null,
      },
      update: {
        brandId: asset.brandId ?? null,
        cloudId: asset.cloudId ?? null,
        cloudObjectKey: asset.cloudObjectKey ?? null,
        deletedAt: asset.deletedAt ?? null,
        displayName: asset.displayName,
        kind: asset.kind,
        localPath: asset.localPath ?? null,
        mimeType: asset.mimeType,
        origin: asset.origin,
        originalFileName: asset.originalFileName,
        residency: asset.residency,
        updatedAt: asset.updatedAt,
        uploadPolicy: asset.uploadPolicy,
        workspaceId: asset.workspaceId ?? null,
      },
      where: {
        id: asset.id,
      },
    });
  }

  async recordAssetSync(update: IDesktopAssetSyncUpdate): Promise<void> {
    const asset = await this.getAsset(update.localAssetId);

    if (!asset) {
      return;
    }

    await this.upsertAsset({
      ...asset,
      cloudId: update.cloudId ?? asset.cloudId,
      cloudObjectKey: update.cloudObjectKey ?? asset.cloudObjectKey,
      deletedAt: update.deletedAt ?? asset.deletedAt,
      residency: update.residency ?? asset.residency,
      updatedAt: update.updatedAt ?? new Date().toISOString(),
      uploadPolicy: update.uploadPolicy ?? asset.uploadPolicy,
    });
  }

  async listSyncOps(workspaceId?: string): Promise<SyncOpRow[]> {
    const client = await this.getClient();
    const rows = await client.desktopSyncOp.findMany({
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
      acknowledgedAt: row.acknowledgedAt,
      baseVersion: row.baseVersion,
      createdAt: row.createdAt,
      entityId: row.entityId,
      entityType: row.entityType,
      error: row.error,
      id: row.id,
      operation: row.operation,
      payload: row.payload,
      retryCount: row.retryCount,
      status: row.status,
      updatedAt: row.updatedAt,
      workspaceId: row.workspaceId,
    }));
  }

  async upsertSyncOp(row: SyncOpRow): Promise<void> {
    const client = await this.getClient();
    await client.desktopSyncOp.upsert({
      create: row,
      update: {
        acknowledgedAt: row.acknowledgedAt,
        baseVersion: row.baseVersion,
        error: row.error,
        payload: row.payload,
        retryCount: row.retryCount,
        status: row.status,
        updatedAt: row.updatedAt,
        workspaceId: row.workspaceId,
      },
      where: {
        id: row.id,
      },
    });
  }

  async ackSyncOps(results: IDesktopSyncOpAck[]): Promise<void> {
    const client = await this.getClient();
    const acknowledgedAt = new Date().toISOString();

    await Promise.all(
      results.map((result) =>
        client.desktopSyncOp.updateMany({
          data: {
            acknowledgedAt:
              result.status === 'acked'
                ? (result.acknowledgedAt ?? acknowledgedAt)
                : null,
            error: result.error ?? null,
            status: result.status,
            updatedAt: acknowledgedAt,
          },
          where: {
            id: result.id,
          },
        }),
      ),
    );
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
