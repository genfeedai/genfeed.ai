import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { assertMinimaxH3ReferenceDurations } from '@api/collections/videos/services/minimax-h3-reference.util';
import { assertReplicateVideoReference } from '@api/collections/videos/services/seedance-reference-evidence.util';
import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type { ConfigService } from '@libs/config/config.service';
import { HttpException, HttpStatus } from '@nestjs/common';

export async function resolveStoredAudioReference(
  ingredients: Pick<IngredientsService, 'findOne'>,
  files: Pick<FilesClientService, 'getPresignedDownloadUrlForObjectKey'>,
  referenceId: string,
  organizationId: string,
) {
  const ingredient = await ingredients.findOne(
    {
      id: referenceId,
      organizationId,
      isDeleted: false,
      category: {
        in: [
          IngredientCategory.AUDIO,
          IngredientCategory.VOICE,
          IngredientCategory.MUSIC,
        ],
      },
      status: {
        in: [
          IngredientStatus.GENERATED,
          IngredientStatus.VALIDATED,
          IngredientStatus.UPLOADED,
        ],
      },
    },
    [{ path: 'metadata', select: ['duration'] }],
  );
  const duration = ingredient?.metadata?.duration;
  if (!ingredient?.s3Key || typeof duration !== 'number') {
    throw new HttpException(
      'Choose stored, playable audio with a known duration from this organization',
      HttpStatus.BAD_REQUEST,
    );
  }
  assertMinimaxH3ReferenceDurations([duration], 'audio');
  return {
    duration,
    url: await files.getPresignedDownloadUrlForObjectKey(ingredient.s3Key),
  };
}

export async function resolveStoredVideoReference(
  ingredients: Pick<IngredientsService, 'findOne'>,
  files: Pick<
    FilesClientService,
    'getPresignedDownloadUrlForObjectKey' | 'getPresignedDownloadUrl'
  >,
  config: Pick<ConfigService, 'isAuthorizedMediaDeliveryEnabled'>,
  referenceId: string,
  organizationId: string,
  role: string,
): Promise<{ duration: number; url: string }> {
  const ingredient = await ingredients.findOne(
    {
      category: IngredientCategory.VIDEO,
      id: referenceId,
      isDeleted: false,
      organizationId,
    },
    [{ path: 'metadata', select: ['duration'] }],
  );
  if (!ingredient?.id) {
    throw new HttpException(
      {
        detail: `Could not resolve a stored video for the ${role} reference`,
        title: 'Generation brief reference resolution failed',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
  const duration = ingredient.metadata?.duration;
  assertReplicateVideoReference(
    duration,
    Boolean(ingredient.s3Key),
    config.isAuthorizedMediaDeliveryEnabled,
    role,
  );
  return {
    duration,
    url:
      config.isAuthorizedMediaDeliveryEnabled && ingredient.s3Key
        ? await files.getPresignedDownloadUrlForObjectKey(ingredient.s3Key)
        : await files.getPresignedDownloadUrl(String(ingredient.id), 'videos'),
  };
}

/** Resolve narration authority and duration before prompt enhancement or output admission. */
export async function resolveStoredAudioReferences(
  ingredients: Pick<IngredientsService, 'findOne'>,
  files: Pick<FilesClientService, 'getPresignedDownloadUrlForObjectKey'>,
  organizationId: string,
  ids: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  const references = await Promise.all(
    ids.map((id) =>
      resolveStoredAudioReference(ingredients, files, id, organizationId),
    ),
  );
  assertMinimaxH3ReferenceDurations(
    references.map((reference) => reference.duration),
    'audio',
  );
  return new Map(ids.map((id, index) => [id, references[index].url]));
}

export function resolveCompiledAudioReferences(
  ids: readonly unknown[],
  urls: ReadonlyMap<string, string>,
): string[] {
  return ids.map((id) => {
    const url = typeof id === 'string' ? urls.get(id) : undefined;
    if (!url)
      throw new HttpException(
        'Audio reference authority is missing',
        HttpStatus.BAD_REQUEST,
      );
    return url;
  });
}
