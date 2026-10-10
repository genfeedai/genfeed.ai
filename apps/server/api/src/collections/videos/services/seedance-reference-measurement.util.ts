import {
  bindSeedanceVideoReferences,
  measuredSeedanceVideoReference,
  requireSeedanceStoredReferenceKey,
  type SeedanceVideoReferenceEvidence,
} from '@api/collections/videos/services/seedance-reference-evidence.util';
import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';

export interface StoredSeedanceReferenceReader {
  findStoredVideo(
    assetId: string,
    organizationId: string,
  ): Promise<{ s3Key: string | null } | null>;
  files: Pick<
    FilesClientService,
    | 'getPresignedDownloadUrlForObjectKey'
    | 'fingerprintMedia'
    | 'probeMediaFromUrl'
  >;
}

/** Resolve the tenant asset and measure stable bytes; UI metadata and transport URLs are not evidence. */
export async function measureStoredSeedanceVideoReferences(
  reader: StoredSeedanceReferenceReader,
  input: {
    endpoint: string;
    organizationId: string;
    assetIds: readonly string[];
  },
): Promise<SeedanceVideoReferenceEvidence[]> {
  const references: SeedanceVideoReferenceEvidence[] = [];
  for (const assetId of input.assetIds) {
    const ingredient = await reader.findStoredVideo(
      assetId,
      input.organizationId,
    );
    const sourceKey = requireSeedanceStoredReferenceKey(ingredient?.s3Key);
    const url =
      await reader.files.getPresignedDownloadUrlForObjectKey(sourceKey);
    const before = await reader.files.fingerprintMedia(url);
    const probe = await reader.files.probeMediaFromUrl(url, 'video');
    const after = await reader.files.fingerprintMedia(url);
    references.push(
      measuredSeedanceVideoReference({
        assetId,
        organizationId: input.organizationId,
        sourceKey,
        url,
        before,
        probe,
        after,
      }),
    );
  }
  bindSeedanceVideoReferences(input.endpoint, input.organizationId, references);
  return references;
}
