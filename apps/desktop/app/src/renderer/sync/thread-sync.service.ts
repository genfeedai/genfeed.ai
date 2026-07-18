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
import {
  canSyncAssetMetadata,
  canUploadAssetContent,
} from './asset-sync-policy';

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
    signal: AbortSignal;
  }): Promise<{ errors: string[]; pushedCount: number }> {
    const { apiEndpoint, session, signal } = opts;
    const errors: string[] = [];
    signal.throwIfAborted();
    const pendingOps = (await window.genfeedDesktop.sync.getOps()).filter(
      (op: IDesktopSyncOp) => op.status === 'pending',
    );
    signal.throwIfAborted();

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
      signal,
    });

    if (!response.ok) {
      return {
        errors: [`Sync op push failed: ${response.status}`],
        pushedCount: 0,
      };
    }

    const body = (await response.json()) as PushResponse;
    signal.throwIfAborted();
    await window.genfeedDesktop.sync.ackOps(
      session.userId,
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
    signal: AbortSignal;
  }): Promise<AssetUploadedResponse['data']> {
    const { apiEndpoint, asset, cloudAssetId, session, signal } = opts;
    signal.throwIfAborted();
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
        signal,
      },
    );

    if (!uploadUrlRes.ok) {
      throw new Error(`Asset upload URL failed: ${uploadUrlRes.status}`);
    }

    const upload = (await uploadUrlRes.json()) as AssetUploadResponse;
    signal.throwIfAborted();
    const assetUrl = await window.genfeedDesktop.files.getAssetUrl(asset.id);
    signal.throwIfAborted();
    const assetRes = await fetch(assetUrl, { signal });

    if (!assetRes.ok) {
      throw new Error(`Local asset read failed: ${assetRes.status}`);
    }

    const blob = await assetRes.blob();
    signal.throwIfAborted();

    if (upload.data.uploadMode === 'api-proxy') {
      const data = await blobToBase64(blob);
      signal.throwIfAborted();
      const proxyRes = await fetch(
        `${apiEndpoint}/sync/desktop/assets/${encodeURIComponent(cloudAssetId || upload.data.cloudAssetId)}/upload`,
        {
          body: JSON.stringify({
            data,
            mimeType: asset.mimeType,
            originalFileName: asset.originalFileName,
          }),
          headers: {
            Authorization: `Bearer ${session.token}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
          signal,
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
      signal,
    });

    if (!uploadRes.ok) {
      throw new Error(`Asset upload failed: ${uploadRes.status}`);
    }

    const confirmRes = await fetch(
      `${apiEndpoint}/sync/desktop/assets/${encodeURIComponent(cloudAssetId || upload.data.cloudAssetId)}/uploaded`,
      {
        headers: { Authorization: `Bearer ${session.token}` },
        method: 'POST',
        signal,
      },
    );

    if (!confirmRes.ok) {
      throw new Error(`Asset upload confirm failed: ${confirmRes.status}`);
    }

    return ((await confirmRes.json()) as AssetUploadedResponse).data;
  }

  private async pushAssets(opts: {
    hasFullAssetUploadConsent: boolean;
    apiEndpoint: string;
    session: IDesktopSession;
    signal: AbortSignal;
  }): Promise<{ errors: string[]; pushedCount: number; uploadCount: number }> {
    const { hasFullAssetUploadConsent, apiEndpoint, session, signal } = opts;
    const errors: string[] = [];
    let uploadCount = 0;
    signal.throwIfAborted();
    const assets = await window.genfeedDesktop.files.listAssets();
    signal.throwIfAborted();
    const syncableAssets = assets.filter(
      (asset: IDesktopAsset) =>
        canSyncAssetMetadata(asset) &&
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
        signal,
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
    signal.throwIfAborted();
    const assetById = new Map(syncableAssets.map((asset) => [asset.id, asset]));

    for (const pushedAsset of body.data.assets) {
      signal.throwIfAborted();
      if (pushedAsset.status === 'rejected') {
        if (pushedAsset.reason === 'cloud-deleted') {
          await window.genfeedDesktop.sync.recordAssetSync(session.userId, {
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

      await window.genfeedDesktop.sync.recordAssetSync(session.userId, {
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
      if (
        !asset ||
        !canUploadAssetContent(asset.uploadPolicy, hasFullAssetUploadConsent)
      ) {
        continue;
      }

      try {
        const uploaded = await this.uploadAsset({
          apiEndpoint,
          asset,
          cloudAssetId: pushedAsset.cloudAssetId,
          session,
          signal,
        });
        signal.throwIfAborted();
        await window.genfeedDesktop.sync.recordAssetSync(session.userId, {
          cloudId: uploaded.cloudAssetId,
          cloudObjectKey: uploaded.cloudObjectKey,
          localAssetId: pushedAsset.localAssetId,
          residency: uploaded.residency ?? 'synced',
          updatedAt: uploaded.updatedAt,
        });
        uploadCount++;
      } catch (error) {
        if (signal.aborted) {
          throw error;
        }
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
    hasFullAssetUploadConsent: boolean;
    apiEndpoint: string;
    localUserId: string;
    session: IDesktopSession;
    signal: AbortSignal;
  }): Promise<SyncResult> {
    const {
      hasFullAssetUploadConsent,
      apiEndpoint,
      localUserId,
      session,
      signal,
    } = opts;
    const errors: string[] = [];
    let assetUploadCount = 0;
    let pushedMetadataCount = 0;
    let pushedCount = 0;
    let pulledCount = 0;
    let pulledMetadataCount = 0;

    try {
      signal.throwIfAborted();
      const [threadsCursor, brandManifestCursor] = await Promise.all([
        window.genfeedDesktop.sync.getCursor(session.userId, 'threads'),
        window.genfeedDesktop.sync.getCursor(session.userId, 'brandManifest'),
      ]);
      signal.throwIfAborted();

      // 1. PUSH: get all local threads
      const localThreads = await queryThreads(localUserId);
      signal.throwIfAborted();
      const pushCandidates = threadsCursor
        ? localThreads.filter((t) => t.updatedAt > threadsCursor)
        : localThreads;

      if (pushCandidates.length > 0) {
        // Batch: max 500 threads per push
        const batch = pushCandidates.slice(0, 500);

        // Log pending
        const logIds = new Map<string, string>();
        for (const t of batch) {
          signal.throwIfAborted();
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
            signal,
          });

          if (pushRes.ok) {
            const pushBody = (await pushRes.json()) as PushResponse;
            signal.throwIfAborted();
            pushedCount = pushBody.data.accepted;

            for (const t of batch) {
              signal.throwIfAborted();
              await markSyncSuccess(
                logIds.get(t.id) ?? `push-${t.id}`,
                new Date().toISOString(),
              );
            }
          } else {
            const errMsg = `Push failed: ${pushRes.status}`;
            errors.push(errMsg);
            for (const t of batch) {
              signal.throwIfAborted();
              await markSyncFailed(logIds.get(t.id) ?? `push-${t.id}`, errMsg);
            }
          }
        } catch (e) {
          if (signal.aborted) {
            throw e;
          }
          const errMsg = e instanceof Error ? e.message : 'Push failed';
          errors.push(errMsg);
        }
      }

      const [assetResult, opResult] = await Promise.all([
        this.pushAssets({
          hasFullAssetUploadConsent,
          apiEndpoint,
          session,
          signal,
        }),
        this.pushSyncOps({ apiEndpoint, session, signal }),
      ]);
      signal.throwIfAborted();

      pushedMetadataCount = assetResult.pushedCount + opResult.pushedCount;
      assetUploadCount = assetResult.uploadCount;
      errors.push(...assetResult.errors, ...opResult.errors);

      // 2. PULL: get remote changes since cursor
      const pullUrl = threadsCursor
        ? `${apiEndpoint}/sync/desktop/threads?cursor=${encodeURIComponent(threadsCursor)}`
        : `${apiEndpoint}/sync/desktop/threads`;

      const pullRes = await fetch(pullUrl, {
        headers: { Authorization: `Bearer ${session.token}` },
        signal,
      });

      if (pullRes.ok) {
        const pullBody = (await pullRes.json()) as PullResponse;
        signal.throwIfAborted();
        const remoteThreads = pullBody.data.threads;

        for (const remote of remoteThreads) {
          signal.throwIfAborted();
          const local = localThreads.find((t) => t.id === remote.id);
          if (!local || remote.updatedAt > local.updatedAt) {
            await upsertThread(localUserId, remote);
            if (remote.messages.length > 0) {
              await upsertMessages(remote.id, remote.messages);
            }
            pulledCount++;
          }
        }

        signal.throwIfAborted();
        await window.genfeedDesktop.sync.setCursor(
          session.userId,
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
        signal,
      });

      if (manifestRes.ok) {
        const manifestBody =
          (await manifestRes.json()) as BrandManifestResponse;
        signal.throwIfAborted();
        await window.genfeedDesktop.sync.applyBrandManifest(
          session.userId,
          manifestBody.data,
        );
        pulledMetadataCount =
          manifestBody.data.brands.length +
          (manifestBody.data.ingredients ?? []).length +
          manifestBody.data.assets.length;
        signal.throwIfAborted();
        await window.genfeedDesktop.sync.setCursor(
          session.userId,
          manifestBody.data.updatedCursor,
          'brandManifest',
        );
      } else {
        errors.push(`Brand manifest pull failed: ${manifestRes.status}`);
      }
    } catch (e) {
      if (signal.aborted) {
        throw e;
      }
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
