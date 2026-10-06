import type { ImageEditingContext } from '@api/collections/images/services/image-generation.types';
import { IMAGE_EDIT_QUALITY } from '@genfeedai/contracts/constants';

/** Exact verified Ideogram 4.5 editing payload. No generation prompt rewriting. */
export function buildIdeogramImageEditInput(
  prompt: string,
  editing: Pick<ImageEditingContext, 'sourceUrls' | 'maskUrl' | 'size'>,
  outputs: number,
  seed?: number,
): Record<string, unknown> {
  return {
    prompt,
    images: editing.sourceUrls,
    ...(editing.maskUrl ? { mask: editing.maskUrl } : {}),
    size: editing.size,
    quality: IMAGE_EDIT_QUALITY,
    num_images: outputs,
    ...(seed !== undefined ? { seed } : {}),
  };
}
