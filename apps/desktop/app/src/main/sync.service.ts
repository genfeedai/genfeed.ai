import { randomUUID } from 'node:crypto';
import type {
  DesktopAssetKind,
  DesktopAssetOrigin,
  DesktopAssetResidency,
  DesktopAssetUploadPolicy,
  IDesktopAsset,
  IDesktopAssetSyncUpdate,
  IDesktopBrand,
  IDesktopBrandManifest,
  IDesktopSyncJob,
  IDesktopSyncOp,
  IDesktopSyncOpAck,
  IDesktopSyncState,
} from '@genfeedai/desktop-contracts';
import type {
  DesktopDatabaseService,
  SyncJobRow,
  SyncOpRow,
} from './database.service';

const toIso = (): string => new Date().toISOString();
const LOCAL_ORGANIZATION_ID = 'desktop-local-org';

const ASSET_KINDS = ['audio', 'document', 'image', 'video'] as const;
const ASSET_ORIGINS = [
  'cloud-generation',
  'local-generation',
  'local-import',
] as const;
const ASSET_RESIDENCIES = [
  'cloud-only',
  'local-only',
  'missing-local',
  'synced',
  'upload-pending',
] as const;
const ASSET_UPLOAD_POLICIES = ['full', 'metadata-only', 'never'] as const;

const isOneOf = <T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): value is T => Boolean(value && allowed.includes(value as T));

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

  private toSyncOp(row: SyncOpRow): IDesktopSyncOp {
    return {
      acknowledgedAt: row.acknowledgedAt ?? undefined,
      baseVersion: row.baseVersion ?? undefined,
      createdAt: row.createdAt,
      entityId: row.entityId,
      entityType: row.entityType,
      error: row.error ?? undefined,
      id: row.id,
      operation: row.operation as IDesktopSyncOp['operation'],
      payload: row.payload,
      retryCount: row.retryCount,
      status: row.status as IDesktopSyncOp['status'],
      updatedAt: row.updatedAt,
      workspaceId: row.workspaceId ?? undefined,
    };
  }

  async listJobs(workspaceId?: string): Promise<IDesktopSyncJob[]> {
    const rows = await this.database.listSyncJobs(workspaceId);
    return rows.map((row) => this.toSyncJob(row));
  }

  async listOps(workspaceId?: string): Promise<IDesktopSyncOp[]> {
    const rows = await this.database.listSyncOps(workspaceId);
    return rows.map((row) => this.toSyncOp(row));
  }

  async getState(): Promise<IDesktopSyncState> {
    const [assets, jobs, ops] = await Promise.all([
      this.database.listAssets(),
      this.listJobs(),
      this.listOps(),
    ]);

    return {
      failedCount:
        jobs.filter((job) => job.status === 'failed').length +
        ops.filter((op) => op.status === 'failed').length,
      lastSyncAt: jobs[0]?.updatedAt ?? ops[0]?.updatedAt,
      pendingAssetCount: assets.filter(
        (asset) => asset.residency === 'upload-pending',
      ).length,
      pendingCount:
        jobs.filter((job) => job.status === 'pending').length +
        ops.filter((op) => op.status === 'pending').length,
      retryingCount: 0,
      runningCount:
        jobs.filter((job) => job.status === 'running').length +
        ops.filter((op) => op.status === 'running').length,
    };
  }

  private inferAssetKind(mimeType: string): DesktopAssetKind {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    return 'document';
  }

  private async applyCloudAsset(
    cloudAsset: IDesktopBrandManifest['assets'][number],
  ): Promise<void> {
    if (!cloudAsset.sha256 || !cloudAsset.sizeBytes) {
      return;
    }

    const localAsset = cloudAsset.localAssetId
      ? await this.database.getAsset(cloudAsset.localAssetId)
      : null;
    const mimeType =
      cloudAsset.mimeType ?? localAsset?.mimeType ?? 'application/octet-stream';
    const kind = isOneOf(cloudAsset.kind, ASSET_KINDS)
      ? cloudAsset.kind
      : this.inferAssetKind(mimeType);
    const origin: DesktopAssetOrigin = isOneOf(cloudAsset.origin, ASSET_ORIGINS)
      ? cloudAsset.origin
      : 'cloud-generation';
    const cloudResidency = isOneOf(cloudAsset.residency, ASSET_RESIDENCIES)
      ? cloudAsset.residency
      : 'cloud-only';
    const residency: DesktopAssetResidency = localAsset?.localPath
      ? cloudResidency === 'cloud-only'
        ? 'synced'
        : cloudResidency
      : cloudResidency === 'synced'
        ? 'missing-local'
        : cloudResidency;
    const uploadPolicy: DesktopAssetUploadPolicy = isOneOf(
      cloudAsset.uploadPolicy,
      ASSET_UPLOAD_POLICIES,
    )
      ? cloudAsset.uploadPolicy
      : 'metadata-only';
    const displayName =
      cloudAsset.displayName ??
      cloudAsset.originalFileName ??
      localAsset?.displayName ??
      cloudAsset.id;

    const asset: IDesktopAsset = {
      brandId: cloudAsset.parentBrandId ?? localAsset?.brandId,
      cloudId: cloudAsset.id,
      cloudObjectKey: cloudAsset.cloudObjectKey ?? localAsset?.cloudObjectKey,
      createdAt: localAsset?.createdAt ?? cloudAsset.createdAt,
      deletedAt:
        cloudAsset.deletedAt ??
        (cloudAsset.isDeleted ? cloudAsset.updatedAt : localAsset?.deletedAt),
      displayName,
      id: localAsset?.id ?? cloudAsset.localAssetId ?? `cloud-${cloudAsset.id}`,
      kind,
      localPath: localAsset?.localPath,
      mimeType,
      organizationId: LOCAL_ORGANIZATION_ID,
      origin,
      originalFileName:
        cloudAsset.originalFileName ??
        localAsset?.originalFileName ??
        displayName,
      residency,
      sha256: cloudAsset.sha256,
      sizeBytes: cloudAsset.sizeBytes,
      updatedAt: cloudAsset.updatedAt,
      uploadPolicy,
      workspaceId: localAsset?.workspaceId,
    };

    await this.database.upsertAsset(asset);
  }

  async applyBrandManifest(manifest: IDesktopBrandManifest): Promise<void> {
    const pulledAt = toIso();

    if (manifest.organization) {
      await this.database.upsertOrganization({
        cloudId: manifest.organization.id,
        createdAt: manifest.organization.updatedAt,
        id: LOCAL_ORGANIZATION_ID,
        name: manifest.organization.label,
        slug: manifest.organization.slug,
        updatedAt: manifest.organization.updatedAt,
      });
    }

    for (const cloudBrand of manifest.brands) {
      if (cloudBrand.isDeleted) {
        await this.database.deleteBrand(cloudBrand.id);
        continue;
      }

      const brand: IDesktopBrand = {
        cloudId: cloudBrand.id,
        createdAt: cloudBrand.updatedAt,
        id: cloudBrand.id,
        lastPulledAt: pulledAt,
        name: cloudBrand.label,
        organizationId: LOCAL_ORGANIZATION_ID,
        slug: cloudBrand.slug,
        syncPolicy: 'metadata-sync',
        updatedAt: cloudBrand.updatedAt,
      };

      await this.database.upsertBrand(brand);
    }

    for (const cloudIngredient of manifest.ingredients ?? []) {
      if (cloudIngredient.isDeleted) {
        await this.database.deleteIngredient(cloudIngredient.id);
        continue;
      }

      const title =
        cloudIngredient.metadata?.label ??
        cloudIngredient.category ??
        cloudIngredient.id;
      const content =
        cloudIngredient.metadata?.description ??
        cloudIngredient.cdnUrl ??
        cloudIngredient.s3Key ??
        title;

      await this.database.upsertIngredient({
        brandId: cloudIngredient.brandId ?? null,
        content,
        createdAt: cloudIngredient.createdAt,
        id: cloudIngredient.id,
        organizationId: LOCAL_ORGANIZATION_ID,
        platform: cloudIngredient.category ?? null,
        sourceContentItemId: null,
        title,
        totalVotes: 0,
        updatedAt: cloudIngredient.updatedAt,
      });
    }

    for (const cloudAsset of manifest.assets) {
      await this.applyCloudAsset(cloudAsset);
    }
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

  async queueOp(
    entityType: string,
    entityId: string,
    operation: IDesktopSyncOp['operation'],
    payload: string,
    workspaceId?: string,
    baseVersion?: string,
  ): Promise<IDesktopSyncOp> {
    const now = toIso();
    const row: SyncOpRow = {
      acknowledgedAt: null,
      baseVersion: baseVersion ?? null,
      createdAt: now,
      entityId,
      entityType,
      error: null,
      id: randomUUID(),
      operation,
      payload,
      retryCount: 0,
      status: 'pending',
      updatedAt: now,
      workspaceId: workspaceId ?? null,
    };

    await this.database.upsertSyncOp(row);
    return this.toSyncOp(row);
  }

  async ackOps(results: IDesktopSyncOpAck[]): Promise<void> {
    await this.database.ackSyncOps(results);
  }

  async recordAssetSync(update: IDesktopAssetSyncUpdate): Promise<void> {
    await this.database.recordAssetSync(update);
  }
}
