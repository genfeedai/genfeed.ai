import type { EditImageDto } from '@api/collections/images/dto/edit-image.dto';
import { fitMaiImageSize } from '@api/collections/images/services/providers/mai-image-fal-input.util';
import {
  FLUX_3_EDIT_CONTRACT_VERSION,
  IMAGE_EDIT_CONTRACT_VERSION,
  IMAGE_EDIT_QUALITY,
  type ImageEditSize,
  isFlux3ImageModel,
  isMaiImageEditModel,
  MAI_IMAGE_EDIT_CONTRACT_VERSION,
} from '@genfeedai/contracts/constants';
import type { ImageEditingRecipe } from '@genfeedai/contracts/interfaces';
import { BadRequestException } from '@nestjs/common';

/** MAI-Image edits take one output and none of the mask, seed, size or native controls. */
export function assertMaiImageEditControls(
  dto: Pick<
    EditImageDto,
    'aspectRatio' | 'maskId' | 'outputs' | 'resolution' | 'seed' | 'size'
  > & { quality?: string },
): void {
  if (
    (dto.outputs ?? 1) !== 1 ||
    dto.seed !== undefined ||
    dto.maskId !== undefined ||
    (dto.size !== undefined && dto.size !== 'source') ||
    dto.quality !== undefined ||
    dto.resolution !== undefined ||
    dto.aspectRatio !== undefined
  )
    throw new BadRequestException(
      'MAI-Image edits take one output and the source dimensions; masks, seeds, sizes and quality are unavailable.',
    );
}

/**
 * The size an edit is billed and dispatched at. fal renders MAI edits inside
 * its own size limits, so billing uses the fitted size, never the raw source.
 */
export function resolveImageEditDimensions(
  model: string,
  size: string,
  source: { height: number; width: number },
): { height: number; width: number } {
  if (isMaiImageEditModel(model)) return fitMaiImageSize(source);
  if (size === 'source') return source;
  const [width, height] = size.split('x').map(Number);
  return { height, width };
}

/** The persisted recipe for the editing contract the model runs. */
export function buildImageEditRecipe(
  dto: EditImageDto,
  sourceIds: string[],
  size: ImageEditSize,
): ImageEditingRecipe {
  const model = dto.model ?? '';
  if (isMaiImageEditModel(model))
    return {
      contractVersion: MAI_IMAGE_EDIT_CONTRACT_VERSION,
      model,
      operation: 'image-edit',
      outputs: 1,
      sourceIds,
    };
  if (isFlux3ImageModel(model))
    return {
      aspectRatio: dto.aspectRatio ?? 'auto',
      contractVersion: FLUX_3_EDIT_CONTRACT_VERSION,
      grounding: false,
      model,
      operation: 'image-edit',
      outputs: 1,
      resolution: dto.resolution ?? '1k',
      sourceIds,
    };
  return {
    contractVersion: IMAGE_EDIT_CONTRACT_VERSION,
    model,
    operation: 'image-edit',
    ...(dto.maskId ? { maskId: dto.maskId } : {}),
    outputs: dto.outputs ?? 1,
    quality: IMAGE_EDIT_QUALITY,
    ...(dto.seed !== undefined ? { seed: dto.seed } : {}),
    size,
    sourceIds,
  };
}
