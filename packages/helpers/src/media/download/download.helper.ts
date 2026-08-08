import type { IIngredient, IMetadata } from '@genfeedai/interfaces';
import { getIngredientExtension } from '@utils/media/ingredient-type.util';
import { saveAs } from 'file-saver';

/**
 * `IngredientCategory` is SCREAMING because it mirrors the Prisma enum, but the
 * category rides into a filename the user actually sees. Lowercase it here so
 * downloads stay `my-label-image-<id>.png`, not `my-label-IMAGE-<id>.png`.
 */
function downloadCategorySegment(ingredient: IIngredient): string {
  return String(ingredient.category ?? '').toLowerCase();
}

export async function downloadIngredient(
  ingredient: IIngredient,
): Promise<void> {
  if (!ingredient.ingredientUrl) {
    throw new Error('No download URL available');
  }

  try {
    const response = await fetch(ingredient.ingredientUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to download ingredient (status ${response.status})`,
      );
    }

    const blob = await response.blob();
    const extension = getIngredientExtension(ingredient);
    const metadata = ingredient.metadata as IMetadata;
    const metadataLabel = metadata?.label;

    saveAs(
      blob,
      `${metadataLabel || 'genfeed'}-${downloadCategorySegment(ingredient)}-${ingredient.id}.${extension}`,
    );
  } catch {
    // Fallback: use anchor element for cross-origin downloads
    const link = document.createElement('a');
    link.href = ingredient.ingredientUrl;
    link.download = `${(ingredient.metadata as IMetadata)?.label || 'genfeed'}-${downloadCategorySegment(ingredient)}-${ingredient.id}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export async function downloadUrl(
  url: string,
  filename?: string,
): Promise<void> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download file (status ${response.status})`);
    }

    const blob = await response.blob();
    saveAs(blob, filename || 'download');
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
