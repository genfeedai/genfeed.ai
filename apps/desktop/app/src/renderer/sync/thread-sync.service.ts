import type {
  IDesktopAsset,
  IDesktopBrandManifest,
  IDesktopSession,
  IDesktopSyncOp,
  IDesktopThread,
} from '@genfeedai/desktop-contracts';
import {
  markSyncFailed,
  markSyncSuccess,
  upsertSyncLogEntry,
} from '../db/pglite';
import { queryThreads, upsertMessages, upsertThread } from '../db/threads';

export type SyncResult = {
  assetUploadCount: number;
  errors: string[];
  pulledCount: number;
  pulledMetadataCount: number;
  pushedCount: number;
  pushedMetadataCount: number;
};

type PullResponse = {
  data: { threads: IDesktopThread[]; updatedCursor: string };
};

type PushResponse = {
  data: {
    accepted: number;
    ops?: Array<{
      id: string;
      reason?: string;
      status: 'accepted' | 'rejected';
    }>;
    rejected: number;
    updatedCursor: string;
  };
};

type AssetPushResponse = {
  data: {
    accepted: number;
    assets: Array<{
      cloudAssetId?: string;
      cloudObjectKey?: string;
      deletedAt?: string;
      localAssetId: string;
      needsUpload?: boolean;
      reason?: string;
      residency?: IDesktopAsset['residency'];
      status: 'accepted' | 'rejected';
      updatedAt?: string;
      uploadPolicy?: IDesktopAsset['uploadPolicy'];
    }>;
    rejected: number;
    updatedCursor: string;
  };
};

type AssetUploadResponse = {
  data: {
    cloudAssetId: string;
    cloudObjectKey?: string;
    expiresIn: number;
    publicUrl: string;
    s3Key: string;
    uploadMode?: 'api-proxy' | 'presigned-put';
    uploadUrl: string;
  };
};

type AssetUploadedResponse = {
  data: {
    cloudAssetId: string;
    cloudObjectKey?: string;
    residency?: IDesktopAsset['residency'];
    updatedAt?: string;
  };
};

type BrandManifestResponse = {
  data: IDesktopBrandManifest;
};

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(reader.error ?? new Error('Read failed'));
    reader.onloadend = () => {
      const value = String(reader.result ?? '');
      const separatorIndex = value.indexOf(',');
      resolve(separatorIndex >= 0 ? value.slice(separatorIndex + 1) : value);
    };
    reader.readAsDataURL(blob);
  });

export class ThreadSyncService {
  private async pushSyncOps(opts: {
    apiEndpoint: string;
    session: IDesktopSession;
  }): Promise<{ errors: string[]; pushedCount: number }> {
    const { apiEndpoint, session } = opts;
    const errors: string[] = [];
    const pendingOps = (await window.genfeedDesktop.sync.getOps()).filter(
      (op: IDesktopSyncOp) => op.status === 'pending',
    );

    if (pendingOps.length === 0) {
      return { errors, pushedCount: 0 };
    }

    const response = await fetch(`${apiEndpoint}/sync/desktop/ops`, {
      body: JSON.stringify({ ops: pendingOps.slice(0, 500) }),
      headers: {
        Authorization: `Bearer ${session.token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });

    if (!response.ok) {
      return {
        errors: [`Sync op push failed: ${response.status}`],
        pushedCount: 0,
      };
    }

    const body = (await response.json()) as PushResponse;
    await window.genfeedDesktop.sync.ackOps(
      (body.data.ops ?? []).map((op) => ({
        acknowledgedAt: new Date().toISOString(),
        error: op.reason,
        id: op.id,
        status: op.status === 'accepted' ? 'acked' : 'failed',
      })),
    );

    return { errors, pushedCount: body.data.accepted };
  }

  private async uploadAsset(opts: {
    apiEndpoint: string;
    asset: IDesktopAsset;
    cloudAssetId: string;
    session: IDesktopSession;
  }): Promise<AssetUploadedResponse['data']> {
    const { apiEndpoint, asset, cloudAssetId, session } = opts;
    const uploadUrlRes = await fetch(
      `${apiEndpoint}/sync/desktop/assets/upload-url`,
      {
        body: JSON.stringify({
          assetId: asset.id,
          mimeType: asset.mimeType,
          originalFileName: asset.originalFileName,
        }),
        headers: {
          Authorization: `Bearer ${session.token}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
      },
    );

    if (!uploadUrlRes.ok) {
      throw new Error(`Asset upload URL failed: ${uploadUrlRes.status}`);
    }

    const upload = (await uploadUrlRes.json()) as AssetUploadResponse;
    const assetUrl = await window.genfeedDesktop.files.getAssetUrl(asset.id);
    const assetRes = await fetch(assetUrl);

    if (!assetRes.ok) {
      throw new Error(`Local asset read failed: ${assetRes.status}`);
    }

    const blob = await assetRes.blob();

    if (upload.data.uploadMode === 'api-proxy') {
      const proxyRes = await fetch(
        `${apiEndpoint}/sync/desktop/assets/${encodeURIComponent(cloudAssetId || upload.data.cloudAssetId)}/upload`,
        {
          body: JSON.stringify({
            data: await blobToBase64(blob),
            mimeType: asset.mimeType,
            originalFileName: asset.originalFileName,
          }),
          headers: {
            Authorization: `Bearer ${session.token}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
        },
      );

      if (!proxyRes.ok) {
        throw new Error(`Asset proxy upload failed: ${proxyRes.status}`);
      }

      return ((await proxyRes.json()) as AssetUploadedResponse).data;
    }

    const uploadRes = await fetch(upload.data.uploadUrl, {
      body: blob,
      headers: {
        'Content-Type': asset.mimeType,
      },
      method: 'PUT',
    });

    if (!uploadRes.ok) {
      throw new Error(`Asset upload failed: ${uploadRes.status}`);
    }

    const confirmRes = await fetch(
      `${apiEndpoint}/sync/desktop/assets/${encodeURIComponent(cloudAssetId || upload.data.cloudAssetId)}/uploaded`,
      {
        headers: { Authorization: `Bearer ${session.token}` },
        method: 'POST',
      },
    );

    if (!confirmRes.ok) {
      throw new Error(`Asset upload confirm failed: ${confirmRes.status}`);
    }

    return ((await confirmRes.json()) as AssetUploadedResponse).data;
  }

  private async pushAssets(opts: {
    apiEndpoint: string;
    session: IDesktopSession;
  }): Promise<{ errors: string[]; pushedCount: number; uploadCount: number }> {
    const { apiEndpoint, session } = opts;
    const errors: string[] = [];
    let uploadCount = 0;
    const assets = await window.genfeedDesktop.files.listAssets();
    const syncableAssets = assets.filter(
      (asset: IDesktopAsset) =>
        asset.uploadPolicy !== 'never' &&
        asset.origin !== 'cloud-generation' &&
        (!asset.cloudId ||
          asset.residency === 'upload-pending' ||
          (asset.uploadPolicy === 'full' && asset.residency !== 'synced')),
    );

    if (syncableAssets.length === 0) {
      return { errors, pushedCount: 0, uploadCount };
    }

    const response = await fetch(
      `${apiEndpoint}/sync/desktop/assets/metadata`,
      {
        body: JSON.stringify({ assets: syncableAssets.slice(0, 500) }),
        headers: {
          Authorization: `Bearer ${session.token}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
      },
    );

    if (!response.ok) {
      return {
        errors: [`Asset metadata push failed: ${response.status}`],
        pushedCount: 0,
        uploadCount,
      };
    }

    const body = (await response.json()) as AssetPushResponse;
    const assetById = new Map(syncableAssets.map((asset) => [asset.id, asset]));

    for (const pushedAsset of body.data.assets) {
      if (pushedAsset.status === 'rejected') {
        if (pushedAsset.reason === 'cloud-deleted') {
          await window.genfeedDesktop.sync.recordAssetSync({
            cloudId: pushedAsset.cloudAssetId,
            deletedAt: pushedAsset.deletedAt ?? new Date().toISOString(),
            localAssetId: pushedAsset.localAssetId,
            residency: pushedAsset.residency,
            updatedAt: pushedAsset.updatedAt,
            uploadPolicy: 'never',
          });
        }
        continue;
      }

      await window.genfeedDesktop.sync.recordAssetSync({
        cloudId: pushedAsset.cloudAssetId,
        cloudObjectKey: pushedAsset.cloudObjectKey,
        localAssetId: pushedAsset.localAssetId,
        residency: pushedAsset.residency,
        updatedAt: pushedAsset.updatedAt,
        uploadPolicy: pushedAsset.uploadPolicy,
      });

      if (!pushedAsset.needsUpload || !pushedAsset.cloudAssetId) {
        continue;
      }

      const asset = assetById.get(pushedAsset.localAssetId);
      if (asset?.uploadPolicy !== 'full') {
        continue;
      }

      try {
        const uploaded = await this.uploadAsset({
          apiEndpoint,
          asset,
          cloudAssetId: pushedAsset.cloudAssetId,
          session,
        });
        await window.genfeedDesktop.sync.recordAssetSync({
          cloudId: uploaded.cloudAssetId,
          cloudObjectKey: uploaded.cloudObjectKey,
          localAssetId: pushedAsset.localAssetId,
          residency: uploaded.residency ?? 'synced',
          updatedAt: uploaded.updatedAt,
        });
        uploadCount++;
      } catch (error) {
        errors.push(
          error instanceof Error ? error.message : 'Asset upload failed',
        );
      }
    }

    return {
      errors,
      pushedCount: body.data.accepted,
      uploadCount,
    };
  }

  async run(opts: {
    apiEndpoint: string;
    localUserId: string;
    session: IDesktopSession;
  }): Promise<SyncResult> {
    const { apiEndpoint, localUserId, session } = opts;
    const errors: string[] = [];
    let assetUploadCount = 0;
    let pushedMetadataCount = 0;
    let pushedCount = 0;
    let pulledCount = 0;
    let pulledMetadataCount = 0;

    try {
      const [threadsCursor, brandManifestCursor] = await Promise.all([
        window.genfeedDesktop.sync.getCursor('threads'),
        window.genfeedDesktop.sync.getCursor('brandManifest'),
      ]);

      // 1. PUSH: get all local threads
      const localThreads = await queryThreads(localUserId);
      const pushCandidates = threadsCursor
        ? localThreads.filter((t) => t.updatedAt > threadsCursor)
        : localThreads;

      if (pushCandidates.length > 0) {
        // Batch: max 500 threads per push
        const batch = pushCandidates.slice(0, 500);

        // Log pending
        const logIds = new Map<string, string>();
        for (const t of batch) {
          const logId = `push-${t.id}-${Date.now()}`;
          logIds.set(t.id, logId);
          await upsertSyncLogEntry({
            direction: 'push',
            entity: 'thread',
            entity_id: t.id,
            id: logId,
            status: 'pending',
          });
        }

        try {
          const pushRes = await fetch(`${apiEndpoint}/sync/desktop/threads`, {
            body: JSON.stringify({ localUserId, threads: batch }),
            headers: {
              Authorization: `Bearer ${session.token}`,
              'Content-Type': 'application/json',
            },
            method: 'POST',
          });

          if (pushRes.ok) {
            const pushBody = (await pushRes.json()) as PushResponse;
            pushedCount = pushBody.data.accepted;

            for (const t of batch) {
              await markSyncSuccess(
                logIds.get(t.id) ?? `push-${t.id}`,
                new Date().toISOString(),
              );
            }
          } else {
            const errMsg = `Push failed: ${pushRes.status}`;
            errors.push(errMsg);
            for (const t of batch) {
              await markSyncFailed(logIds.get(t.id) ?? `push-${t.id}`, errMsg);
            }
          }
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : 'Push failed';
          errors.push(errMsg);
        }
      }

      const [assetResult, opResult] = await Promise.all([
        this.pushAssets({ apiEndpoint, session }),
        this.pushSyncOps({ apiEndpoint, session }),
      ]);

      pushedMetadataCount = assetResult.pushedCount + opResult.pushedCount;
      assetUploadCount = assetResult.uploadCount;
      errors.push(...assetResult.errors, ...opResult.errors);

      // 2. PULL: get remote changes since cursor
      const pullUrl = threadsCursor
        ? `${apiEndpoint}/sync/desktop/threads?cursor=${encodeURIComponent(threadsCursor)}`
        : `${apiEndpoint}/sync/desktop/threads`;

      const pullRes = await fetch(pullUrl, {
        headers: { Authorization: `Bearer ${session.token}` },
      });

      if (pullRes.ok) {
        const pullBody = (await pullRes.json()) as PullResponse;
        const remoteThreads = pullBody.data.threads;

        for (const remote of remoteThreads) {
          const local = localThreads.find((t) => t.id === remote.id);
          if (!local || remote.updatedAt > local.updatedAt) {
            await upsertThread(localUserId, remote);
            if (remote.messages.length > 0) {
              await upsertMessages(remote.id, remote.messages);
            }
            pulledCount++;
          }
        }

        await window.genfeedDesktop.sync.setCursor(
          pullBody.data.updatedCursor,
          'threads',
        );
      } else {
        errors.push(`Pull failed: ${pullRes.status}`);
      }

      const manifestUrl = brandManifestCursor
        ? `${apiEndpoint}/sync/desktop/brand-manifest?cursor=${encodeURIComponent(brandManifestCursor)}`
        : `${apiEndpoint}/sync/desktop/brand-manifest`;
      const manifestRes = await fetch(manifestUrl, {
        headers: { Authorization: `Bearer ${session.token}` },
      });

      if (manifestRes.ok) {
        const manifestBody =
          (await manifestRes.json()) as BrandManifestResponse;
        await window.genfeedDesktop.sync.applyBrandManifest(manifestBody.data);
        pulledMetadataCount =
          manifestBody.data.brands.length +
          (manifestBody.data.ingredients ?? []).length +
          manifestBody.data.assets.length;
        await window.genfeedDesktop.sync.setCursor(
          manifestBody.data.updatedCursor,
          'brandManifest',
        );
      } else {
        errors.push(`Brand manifest pull failed: ${manifestRes.status}`);
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'Sync failed');
    }

    return {
      assetUploadCount,
      errors,
      pulledCount,
      pulledMetadataCount,
      pushedCount,
      pushedMetadataCount,
    };
  }
}
