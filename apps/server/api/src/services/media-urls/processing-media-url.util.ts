import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import type { AuthorizedMediaUrlService } from '@api/services/media-urls/authorized-media-url.service';
import type { ConfigService } from '@libs/config/config.service';

interface ProcessingMediaUrlDeps {
  authorizedMediaUrls?: Pick<AuthorizedMediaUrlService, 'issueServerPublish'>;
  configService?: Pick<
    ConfigService,
    'ingredientsEndpoint' | 'isAuthorizedMediaDeliveryEnabled'
  >;
  filesClientService?: Pick<
    FilesClientService,
    'getPresignedDownloadUrl' | 'getPresignedDownloadUrlForObjectKey'
  >;
}

export interface ProcessingMediaAsset {
  id: string;
  objectKey?: string | null;
  storageKey: string;
  storageType: string;
}

async function issueAuthorizedUrl(
  authorizedMediaUrls: ProcessingMediaUrlDeps['authorizedMediaUrls'],
  organizationId: string,
  ingredientId: string,
): Promise<string> {
  if (!authorizedMediaUrls)
    throw new Error('Authorized media issuer is unavailable');
  const urls = await authorizedMediaUrls.issueServerPublish(organizationId, [
    ingredientId,
  ]);
  const url = urls.get(ingredientId);
  if (!url) throw new Error('The source has no authorized media URL');
  return url;
}

/**
 * URL a provider fetches an ingredient from: an authorized grant when
 * authorized delivery is on, the public ingredients endpoint otherwise.
 */
export async function resolveIngredientProcessingUrl(
  deps: ProcessingMediaUrlDeps,
  organizationId: string,
  ingredientId: string,
  category: string,
): Promise<string> {
  if (!deps.configService?.isAuthorizedMediaDeliveryEnabled)
    return `${deps.configService?.ingredientsEndpoint}/${category}/${ingredientId}`;
  return issueAuthorizedUrl(
    deps.authorizedMediaUrls,
    organizationId,
    ingredientId,
  );
}

/**
 * URL a provider fetches a stored asset from: an authorized grant when
 * authorized delivery is on, a presigned storage URL otherwise.
 */
export async function resolveAssetProcessingUrl(
  deps: ProcessingMediaUrlDeps,
  organizationId: string,
  asset: ProcessingMediaAsset,
): Promise<string> {
  if (deps.configService?.isAuthorizedMediaDeliveryEnabled)
    return issueAuthorizedUrl(
      deps.authorizedMediaUrls,
      organizationId,
      asset.id,
    );
  if (!deps.filesClientService)
    throw new Error('File storage service is unavailable');
  return asset.objectKey
    ? deps.filesClientService.getPresignedDownloadUrlForObjectKey(
        asset.objectKey,
      )
    : deps.filesClientService.getPresignedDownloadUrl(
        asset.storageKey,
        asset.storageType,
      );
}
