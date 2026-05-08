import { describe, expect, it } from 'bun:test';
import type {
  IDesktopAsset,
  IDesktopAssetSyncUpdate,
  IDesktopBrand,
  IDesktopSyncOpAck,
} from '@genfeedai/desktop-contracts';
import type {
  DesktopDatabaseService,
  IngredientRow,
  OrganizationRow,
  SyncJobRow,
  SyncOpRow,
} from './database.service';
import { DesktopSyncService } from './sync.service';

const createDatabaseMock = (rows: SyncJobRow[] = []) => {
  const syncJobs = new Map(rows.map((row) => [row.id, row]));
  const syncOps = new Map<string, SyncOpRow>();
  const assets = new Map<string, IDesktopAsset>();
  const brands = new Map<string, IDesktopBrand>();
  const ingredients = new Map<string, IngredientRow>();
  const organizations = new Map<string, OrganizationRow>();

  return {
    ackSyncOps: async (results: IDesktopSyncOpAck[]) => {
      for (const result of results) {
        const op = syncOps.get(result.id);
        if (!op) {
          continue;
        }
        syncOps.set(result.id, {
          ...op,
          acknowledgedAt:
            result.status === 'acked'
              ? (result.acknowledgedAt ?? '2026-05-01T10:00:00.000Z')
              : null,
          error: result.error ?? null,
          status: result.status,
          updatedAt: '2026-05-01T10:00:00.000Z',
        });
      }
    },
    assets,
    brands,
    deleteBrand: async (id: string) => {
      brands.delete(id);
    },
    deleteIngredient: async (id: string) => {
      ingredients.delete(id);
    },
    getAsset: async (assetId: string) => assets.get(assetId) ?? null,
    ingredients,
    listAssets: async () => Array.from(assets.values()),
    listSyncJobs: async (workspaceId?: string) =>
      Array.from(syncJobs.values())
        .filter((row) => !workspaceId || row.workspaceId === workspaceId)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    listSyncOps: async (workspaceId?: string) =>
      Array.from(syncOps.values())
        .filter((row) => !workspaceId || row.workspaceId === workspaceId)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    organizations,
    recordAssetSync: async (update: IDesktopAssetSyncUpdate) => {
      const asset = assets.get(update.localAssetId);
      if (!asset) {
        return;
      }
      assets.set(update.localAssetId, {
        ...asset,
        cloudId: update.cloudId ?? asset.cloudId,
        cloudObjectKey: update.cloudObjectKey ?? asset.cloudObjectKey,
        deletedAt: update.deletedAt ?? asset.deletedAt,
        residency: update.residency ?? asset.residency,
        updatedAt: update.updatedAt ?? asset.updatedAt,
        uploadPolicy: update.uploadPolicy ?? asset.uploadPolicy,
      });
    },
    syncJobs,
    syncOps,
    upsertAsset: async (asset: IDesktopAsset) => {
      assets.set(asset.id, asset);
    },
    upsertBrand: async (brand: IDesktopBrand) => {
      brands.set(brand.id, brand);
    },
    upsertIngredient: async (row: IngredientRow) => {
      ingredients.set(row.id, row);
    },
    upsertOrganization: async (row: OrganizationRow) => {
      organizations.set(row.id, row);
    },
    upsertSyncJob: async (row: SyncJobRow) => {
      syncJobs.set(row.id, row);
    },
    upsertSyncOp: async (row: SyncOpRow) => {
      syncOps.set(row.id, row);
    },
  };
};

describe('DesktopSyncService', () => {
  it('queues pending jobs for a workspace', async () => {
    const database = createDatabaseMock();
    const service = new DesktopSyncService(
      database as unknown as DesktopDatabaseService,
    );

    const job = await service.queueJob(
      'publish',
      '{"draftId":"draft-1"}',
      'ws-1',
    );

    expect(job.status).toBe('pending');
    expect(job.type).toBe('publish');
    expect(job.workspaceId).toBe('ws-1');
    expect(job.retryCount).toBe(0);
    expect(database.syncJobs.get(job.id)?.payload).toBe(
      '{"draftId":"draft-1"}',
    );
  });

  it('summarizes sync state from persisted jobs', async () => {
    const database = createDatabaseMock([
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

    const service = new DesktopSyncService(
      database as unknown as DesktopDatabaseService,
    );

    await expect(service.getState()).resolves.toEqual({
      failedCount: 1,
      lastSyncAt: '2026-04-01T11:00:00.000Z',
      pendingAssetCount: 0,
      pendingCount: 1,
      retryingCount: 0,
      runningCount: 1,
    });
  });

  it('applies cloud brand manifests to local metadata tables', async () => {
    const database = createDatabaseMock();
    const service = new DesktopSyncService(
      database as unknown as DesktopDatabaseService,
    );

    await service.applyBrandManifest({
      assets: [
        {
          cloudObjectKey: 'org-cloud/hash/logo.png',
          createdAt: '2026-05-01T10:00:00.000Z',
          displayName: 'logo.png',
          id: 'asset-cloud',
          kind: 'image',
          mimeType: 'image/png',
          parentBrandId: 'brand-cloud',
          parentOrgId: 'org-cloud',
          residency: 'synced',
          sha256: 'hash',
          sizeBytes: 128,
          updatedAt: '2026-05-01T10:00:00.000Z',
          uploadPolicy: 'metadata-only',
        },
      ],
      brands: [
        {
          id: 'brand-cloud',
          label: 'Cloud Brand',
          organizationId: 'org-cloud',
          slug: 'cloud-brand',
          updatedAt: '2026-05-01T10:00:00.000Z',
        },
      ],
      ingredients: [
        {
          brandId: 'brand-cloud',
          category: 'IMAGE',
          cdnUrl: 'https://cdn.example.com/logo.png',
          createdAt: '2026-05-01T10:00:00.000Z',
          id: 'ingredient-cloud',
          metadata: {
            description: 'Reference logo',
            label: 'Logo Reference',
          },
          organizationId: 'org-cloud',
          updatedAt: '2026-05-01T10:00:00.000Z',
        },
      ],
      organization: {
        id: 'org-cloud',
        label: 'Cloud Org',
        slug: 'cloud-org',
        updatedAt: '2026-05-01T10:00:00.000Z',
      },
      updatedCursor: '2026-05-01T10:00:00.000Z',
    });

    expect(database.organizations.get('desktop-local-org')?.cloudId).toBe(
      'org-cloud',
    );
    expect(database.brands.get('brand-cloud')?.organizationId).toBe(
      'desktop-local-org',
    );
    expect(database.assets.get('cloud-asset-cloud')).toMatchObject({
      brandId: 'brand-cloud',
      cloudId: 'asset-cloud',
      organizationId: 'desktop-local-org',
      residency: 'missing-local',
    });
    expect(database.ingredients.get('ingredient-cloud')).toMatchObject({
      brandId: 'brand-cloud',
      content: 'Reference logo',
      organizationId: 'desktop-local-org',
      platform: 'IMAGE',
      title: 'Logo Reference',
    });
  });

  it('acks pushed sync ops and records cloud asset state locally', async () => {
    const database = createDatabaseMock();
    database.assets.set('asset-local', {
      createdAt: '2026-05-01T10:00:00.000Z',
      displayName: 'logo.png',
      id: 'asset-local',
      kind: 'image',
      localPath: '/workspace/.genfeed/assets/logo.png',
      mimeType: 'image/png',
      organizationId: 'desktop-local-org',
      origin: 'local-import',
      originalFileName: 'logo.png',
      residency: 'upload-pending',
      sha256: 'hash',
      sizeBytes: 128,
      updatedAt: '2026-05-01T10:00:00.000Z',
      uploadPolicy: 'full',
      workspaceId: 'ws-1',
    });

    const service = new DesktopSyncService(
      database as unknown as DesktopDatabaseService,
    );
    const op = await service.queueOp('asset', 'asset-local', 'delete', '{}');

    await service.ackOps([
      {
        acknowledgedAt: '2026-05-01T11:00:00.000Z',
        id: op.id,
        status: 'acked',
      },
    ]);
    await service.recordAssetSync({
      cloudId: 'asset-cloud',
      cloudObjectKey: 'ingredients/desktop-assets/org/hash/logo.png',
      localAssetId: 'asset-local',
      residency: 'synced',
      updatedAt: '2026-05-01T11:00:00.000Z',
    });

    expect(database.syncOps.get(op.id)).toMatchObject({
      acknowledgedAt: '2026-05-01T11:00:00.000Z',
      status: 'acked',
    });
    expect(database.assets.get('asset-local')).toMatchObject({
      cloudId: 'asset-cloud',
      cloudObjectKey: 'ingredients/desktop-assets/org/hash/logo.png',
      residency: 'synced',
    });
  });
});
