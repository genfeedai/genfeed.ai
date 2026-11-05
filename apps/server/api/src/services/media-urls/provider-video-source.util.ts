import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { traced } from '@libs/tracing/traced';

const PROVIDER_SOURCE_KEY_PREFIX = 'provider-inputs/videos';

export interface ProviderVideoSourceAsset {
  id: string;
  objectKey?: string | null;
  storageKey: string;
  storageType: string;
}

/**
 * A presigned URL for an `.mp4`-named copy of a stored video.
 *
 * Topaz reads the source container from the URL path. Stored videos live under
 * extensionless keys, so it rejects them with "`source.container` is
 * required". A Replicate Files-API URL is rejected too. The copy keeps the
 * stored content type, and its key is deterministic, so repeat upscales
 * overwrite one object per video.
 */
export const presignNamedProviderVideoSource = traced(
  'presignNamedProviderVideoSource',
  async (
    files: Pick<
      FilesClientService,
      'copyInS3' | 'getPresignedDownloadUrlForObjectKey'
    >,
    asset: ProviderVideoSourceAsset,
  ): Promise<string> => {
    const namedKey = `${PROVIDER_SOURCE_KEY_PREFIX}/${asset.id}.mp4`;
    if (asset.objectKey) {
      await files.copyInS3(asset.objectKey, namedKey);
    } else {
      await files.copyInS3(asset.storageKey, namedKey, asset.storageType);
    }
    return files.getPresignedDownloadUrlForObjectKey(namedKey);
  },
);
