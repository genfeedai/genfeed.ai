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
  IDesktopCloudOrganization,
  IDesktopSyncJob,
  IDesktopSyncOp,
  IDesktopSyncOpAck,
  IDesktopSyncState,
} from '@genfeedai/desktop-contracts';
import type { DesktopAsset, PrismaClient } from '@genfeedai/desktop-prisma';
import { toDesktopAsset } from './desktop-asset.util';
import { toIso } from './time.util';

const LOCAL_ORGANIZATION_ID = 'local-org';

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
  private readonly assets = new Map<string, IDesktopAsset>();
  private readonly brands = new Map<string, IDesktopBrand>();
  private readonly cloudOrganizations = new Map<
    string,
    IDesktopCloudOrganization
  >();
  private readonly jobs = new Map<string, IDesktopSyncJob>();
  private readonly ops = new Map<string, IDesktopSyncOp>();

  constructor(private readonly prisma: PrismaClient) {}

  async init(): Promise<void> {
    const [assetRows, brandRows, cloudOrganizationRows, jobRows, opRows] =
      await Promise.all([
        this.prisma.desktopAsset.findMany({
          orderBy: {
            updatedAt: 'desc',
          },
        }),
        this.prisma.desktopBrand.findMany({
          orderBy: {
            updatedAt: 'desc',
          },
        }),
        this.prisma.desktopCloudOrganization.findMany({
          orderBy: {
            updatedAt: 'desc',
          },
        }),
        this.prisma.desktopSyncJob.findMany({
          orderBy: {
            updatedAt: 'desc',
          },
        }),
        this.prisma.desktopSyncOp.findMany({
          orderBy: {
            updatedAt: 'desc',
          },
        }),
      ]);

    this.assets.clear();
    for (const row of assetRows) {
      this.assets.set(row.id, this.toAsset(row));
    }

    this.brands.clear();
    for (const row of brandRows) {
      this.brands.set(row.id, this.toBrand(row));
    }

    this.cloudOrganizations.clear();
    for (const row of cloudOrganizationRows) {
      this.cloudOrganizations.set(row.cloudId, this.toCloudOrganization(row));
    }

    this.jobs.clear();
    for (const row of jobRows) {
      this.jobs.set(row.id, this.toSyncJob(row));
    }

    this.ops.clear();
    for (const row of opRows) {
      this.ops.set(row.id, this.toSyncOp(row));
    }
  }

  private toAsset(row: DesktopAsset): IDesktopAsset {
    return toDesktopAsset(row);
  }

  private toBrand(row: {
    cloudId: string | null;
    cloudOrganizationId: string | null;
    cloudVersion: string | null;
    createdAt: string;
    id: string;
    lastPulledAt: string | null;
    name: string;
    organizationId: string;
    slug: string;
    syncPolicy: string;
    updatedAt: string;
  }): IDesktopBrand {
    return {
      cloudId: row.cloudId ?? undefined,
      cloudOrganizationId: row.cloudOrganizationId ?? undefined,
      cloudVersion: row.cloudVersion ?? undefined,
      createdAt: row.createdAt,
      id: row.id,
      lastPulledAt: row.lastPulledAt ?? undefined,
      name: row.name,
      organizationId: row.organizationId,
      slug: row.slug,
      syncPolicy: row.syncPolicy as IDesktopBrand['syncPolicy'],
      updatedAt: row.updatedAt,
    };
  }

  private toCloudOrganization(row: {
    cloudId: string;
    lastPulledAt: string | null;
    name: string;
    role: string | null;
    slug: string;
    updatedAt: string;
  }): IDesktopCloudOrganization {
    return {
      cloudId: row.cloudId,
      lastPulledAt: row.lastPulledAt ?? undefined,
      name: row.name,
      role: row.role ?? undefined,
      slug: row.slug,
      updatedAt: row.updatedAt,
    };
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

  private listOpCache(workspaceId?: string): IDesktopSyncOp[] {
    return Array.from(this.ops.values())
      .filter((op) => !workspaceId || op.workspaceId === workspaceId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  private toSyncOp(row: {
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
  }): IDesktopSyncOp {
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

  listJobs(workspaceId?: string): IDesktopSyncJob[] {
    return this.listJobCache(workspaceId);
  }

  listOps(workspaceId?: string): IDesktopSyncOp[] {
    return this.listOpCache(workspaceId);
  }

  listBrands(): IDesktopBrand[] {
    return Array.from(this.brands.values()).sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    );
  }

  listCloudOrganizations(): IDesktopCloudOrganization[] {
    return Array.from(this.cloudOrganizations.values()).sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    );
  }

  getState(): IDesktopSyncState {
    const jobs = this.listJobCache();
    const ops = this.listOpCache();

    return {
      failedCount:
        jobs.filter((job) => job.status === 'failed').length +
        ops.filter((op) => op.status === 'failed').length,
      lastSyncAt: jobs[0]?.updatedAt ?? ops[0]?.updatedAt,
      pendingAssetCount: Array.from(this.assets.values()).filter(
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

  private async upsertAsset(asset: IDesktopAsset): Promise<void> {
    const row = {
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
    };

    await this.prisma.desktopAsset.upsert({
      create: row,
      update: row,
      where: {
        id: row.id,
      },
    });
    this.assets.set(asset.id, asset);
  }

  private async applyCloudAsset(
    cloudAsset: IDesktopBrandManifest['assets'][number],
  ): Promise<void> {
    if (!cloudAsset.sha256 || !cloudAsset.sizeBytes) {
      return;
    }

    const localAsset = cloudAsset.localAssetId
      ? this.assets.get(cloudAsset.localAssetId)
      : undefined;
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

    await this.upsertAsset({
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
    });
  }

  async applyBrandManifest(manifest: IDesktopBrandManifest): Promise<void> {
    const pulledAt = toIso();

    if (manifest.organization) {
      const organization: IDesktopCloudOrganization = {
        cloudId: manifest.organization.id,
        lastPulledAt: pulledAt,
        name: manifest.organization.label,
        slug: manifest.organization.slug,
        updatedAt: manifest.organization.updatedAt,
      };

      await this.prisma.desktopCloudOrganization.upsert({
        create: {
          cloudId: organization.cloudId,
          lastPulledAt: organization.lastPulledAt ?? null,
          name: organization.name,
          role: organization.role ?? null,
          slug: organization.slug,
          updatedAt: organization.updatedAt,
        },
        update: {
          lastPulledAt: organization.lastPulledAt ?? null,
          name: organization.name,
          role: organization.role ?? null,
          slug: organization.slug,
          updatedAt: organization.updatedAt,
        },
        where: {
          cloudId: organization.cloudId,
        },
      });
      this.cloudOrganizations.set(organization.cloudId, organization);
    }

    for (const cloudBrand of manifest.brands) {
      if (cloudBrand.isDeleted) {
        await this.prisma.desktopBrand.deleteMany({
          where: {
            cloudId: cloudBrand.id,
          },
        });
        for (const [brandId, brand] of this.brands) {
          if (brand.cloudId === cloudBrand.id) {
            this.brands.delete(brandId);
          }
        }
        continue;
      }

      const brand: IDesktopBrand = {
        cloudId: cloudBrand.id,
        createdAt: cloudBrand.updatedAt,
        id: cloudBrand.id,
        lastPulledAt: pulledAt,
        name: cloudBrand.label,
        cloudOrganizationId:
          cloudBrand.organizationId ?? manifest.organization?.id,
        organizationId: LOCAL_ORGANIZATION_ID,
        slug: cloudBrand.slug,
        syncPolicy: 'metadata-sync',
        updatedAt: cloudBrand.updatedAt,
      };

      await this.prisma.desktopBrand.upsert({
        create: {
          cloudId: brand.cloudId ?? null,
          cloudOrganizationId: brand.cloudOrganizationId ?? null,
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
          cloudOrganizationId: brand.cloudOrganizationId ?? null,
          cloudVersion: brand.cloudVersion ?? null,
          lastPulledAt: brand.lastPulledAt ?? null,
          name: brand.name,
          organizationId: brand.organizationId,
          slug: brand.slug,
          syncPolicy: brand.syncPolicy,
          updatedAt: brand.updatedAt,
        },
        where: {
          id: brand.id,
        },
      });
      this.brands.set(brand.id, brand);
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

  async queueOp(
    entityType: string,
    entityId: string,
    operation: IDesktopSyncOp['operation'],
    payload: string,
    workspaceId?: string,
    baseVersion?: string,
  ): Promise<IDesktopSyncOp> {
    const now = toIso();
    const row = {
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

    await this.prisma.desktopSyncOp.upsert({
      create: row,
      update: row,
      where: {
        id: row.id,
      },
    });

    const op = this.toSyncOp(row);
    this.ops.set(op.id, op);
    return op;
  }

  async ackOps(results: IDesktopSyncOpAck[]): Promise<void> {
    const updatedAt = toIso();

    await Promise.all(
      results.map(async (result) => {
        const row = {
          acknowledgedAt:
            result.status === 'acked'
              ? (result.acknowledgedAt ?? updatedAt)
              : null,
          error: result.error ?? null,
          status: result.status,
          updatedAt,
        };

        await this.prisma.desktopSyncOp.updateMany({
          data: row,
          where: {
            id: result.id,
          },
        });

        const existing = this.ops.get(result.id);
        if (existing) {
          this.ops.set(result.id, {
            ...existing,
            acknowledgedAt: row.acknowledgedAt ?? undefined,
            error: row.error ?? undefined,
            status: row.status,
            updatedAt: row.updatedAt,
          });
        }
      }),
    );
  }

  async recordAssetSync(update: IDesktopAssetSyncUpdate): Promise<void> {
    const existing = this.assets.get(update.localAssetId);
    if (!existing) {
      return;
    }

    await this.upsertAsset({
      ...existing,
      cloudId: update.cloudId ?? existing.cloudId,
      cloudObjectKey: update.cloudObjectKey ?? existing.cloudObjectKey,
      deletedAt: update.deletedAt ?? existing.deletedAt,
      residency: update.residency ?? existing.residency,
      updatedAt: update.updatedAt ?? toIso(),
      uploadPolicy: update.uploadPolicy ?? existing.uploadPolicy,
    });
  }
}
