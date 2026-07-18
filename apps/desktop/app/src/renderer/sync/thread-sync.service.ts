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

const buildSyncUrl = (
  apiEndpoint: string,
  path: string,
  cursor?: string | null,
): string =>
  cursor
    ? `${apiEndpoint}${path}?cursor=${encodeURIComponent(cursor)}`
    : `${apiEndpoint}${path}`;

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

  private async pushThreads(opts: {
    apiEndpoint: string;
    localThreads: IDesktopThread[];
    localUserId: string;
    session: IDesktopSession;
    signal: AbortSignal;
    threadsCursor?: string | null;
  }): Promise<{ errors: string[]; pushedCount: number }> {
    const {
      apiEndpoint,
      localThreads,
      localUserId,
      session,
      signal,
      threadsCursor,
    } = opts;
    const errors: string[] = [];
    let pushedCount = 0;
    const pushCandidates = threadsCursor
      ? localThreads.filter((thread) => thread.updatedAt > threadsCursor)
      : localThreads;

    if (pushCandidates.length === 0) {
      return { errors, pushedCount };
    }

    const batch = pushCandidates.slice(0, 500);
    const logIds: string[] = [];
    for (const thread of batch) {
      signal.throwIfAborted();
      const logId = `push-${thread.id}-${Date.now()}`;
      await upsertSyncLogEntry({
        direction: 'push',
        entity: 'thread',
        entity_id: thread.id,
        id: logId,
        status: 'pending',
      });
      logIds.push(logId);
    }

    try {
      const response = await fetch(`${apiEndpoint}/sync/desktop/threads`, {
        body: JSON.stringify({ localUserId, threads: batch }),
        headers: {
          Authorization: `Bearer ${session.token}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
        signal,
      });

      if (response.ok) {
        const body = (await response.json()) as PushResponse;
        signal.throwIfAborted();
        pushedCount = body.data.accepted;
        const syncedAt = new Date().toISOString();
        for (const logId of logIds) {
          signal.throwIfAborted();
          await markSyncSuccess(logId, syncedAt);
        }
        return { errors, pushedCount };
      }

      const errorMessage = `Push failed: ${response.status}`;
      errors.push(errorMessage);
      for (const logId of logIds) {
        signal.throwIfAborted();
        await markSyncFailed(logId, errorMessage);
      }
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }
      errors.push(error instanceof Error ? error.message : 'Push failed');
    }

    return { errors, pushedCount };
  }

  private async pullThreads(opts: {
    apiEndpoint: string;
    localThreads: IDesktopThread[];
    localUserId: string;
    result: SyncResult;
    session: IDesktopSession;
    signal: AbortSignal;
    threadsCursor?: string | null;
  }): Promise<{ errors: string[] }> {
    const {
      apiEndpoint,
      localThreads,
      localUserId,
      result,
      session,
      signal,
      threadsCursor,
    } = opts;
    const pullUrl = buildSyncUrl(
      apiEndpoint,
      '/sync/desktop/threads',
      threadsCursor,
    );
    const response = await fetch(pullUrl, {
      headers: { Authorization: `Bearer ${session.token}` },
      signal,
    });

    if (!response.ok) {
      return { errors: [`Pull failed: ${response.status}`] };
    }

    const body = (await response.json()) as PullResponse;
    signal.throwIfAborted();
    const localThreadsById = new Map(
      localThreads.map((thread) => [thread.id, thread]),
    );
    for (const remote of body.data.threads) {
      signal.throwIfAborted();
      const local = localThreadsById.get(remote.id);
      if (!local || remote.updatedAt > local.updatedAt) {
        await upsertThread(localUserId, remote);
        if (remote.messages.length > 0) {
          await upsertMessages(remote.id, remote.messages);
        }
        result.pulledCount++;
      }
    }

    signal.throwIfAborted();
    await window.genfeedDesktop.sync.setCursor(
      session.userId,
      body.data.updatedCursor,
      'threads',
    );
    return { errors: [] };
  }

  private async pullBrandManifest(opts: {
    apiEndpoint: string;
    brandManifestCursor?: string | null;
    result: SyncResult;
    session: IDesktopSession;
    signal: AbortSignal;
  }): Promise<{ errors: string[] }> {
    const { apiEndpoint, brandManifestCursor, result, session, signal } = opts;
    const manifestUrl = buildSyncUrl(
      apiEndpoint,
      '/sync/desktop/brand-manifest',
      brandManifestCursor,
    );
    const response = await fetch(manifestUrl, {
      headers: { Authorization: `Bearer ${session.token}` },
      signal,
    });

    if (!response.ok) {
      return { errors: [`Brand manifest pull failed: ${response.status}`] };
    }

    const body = (await response.json()) as BrandManifestResponse;
    signal.throwIfAborted();
    await window.genfeedDesktop.sync.applyBrandManifest(
      session.userId,
      body.data,
    );
    result.pulledMetadataCount =
      body.data.brands.length +
      (body.data.ingredients ?? []).length +
      body.data.assets.length;
    signal.throwIfAborted();
    await window.genfeedDesktop.sync.setCursor(
      session.userId,
      body.data.updatedCursor,
      'brandManifest',
    );
    return { errors: [] };
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
    const result: SyncResult = {
      assetUploadCount: 0,
      errors,
      pulledCount: 0,
      pulledMetadataCount: 0,
      pushedCount: 0,
      pushedMetadataCount: 0,
    };

    try {
      signal.throwIfAborted();
      const [threadsCursor, brandManifestCursor] = await Promise.all([
        window.genfeedDesktop.sync.getCursor(session.userId, 'threads'),
        window.genfeedDesktop.sync.getCursor(session.userId, 'brandManifest'),
      ]);
      signal.throwIfAborted();

      const localThreads = await queryThreads(localUserId);
      signal.throwIfAborted();
      const threadPushResult = await this.pushThreads({
        apiEndpoint,
        localThreads,
        localUserId,
        session,
        signal,
        threadsCursor,
      });
      result.pushedCount = threadPushResult.pushedCount;
      errors.push(...threadPushResult.errors);

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

      result.pushedMetadataCount =
        assetResult.pushedCount + opResult.pushedCount;
      result.assetUploadCount = assetResult.uploadCount;
      errors.push(...assetResult.errors, ...opResult.errors);

      const threadPullResult = await this.pullThreads({
        apiEndpoint,
        localThreads,
        localUserId,
        result,
        session,
        signal,
        threadsCursor,
      });
      errors.push(...threadPullResult.errors);

      const manifestResult = await this.pullBrandManifest({
        apiEndpoint,
        brandManifestCursor,
        result,
        session,
        signal,
      });
      errors.push(...manifestResult.errors);
    } catch (e) {
      if (signal.aborted) {
        throw e;
      }
      errors.push(e instanceof Error ? e.message : 'Sync failed');
    }

    return result;
  }
}
