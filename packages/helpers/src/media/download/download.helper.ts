import type { IIngredient, IMetadata } from '@genfeedai/contracts/interfaces';
import { getIngredientExtension } from '@utils/media/ingredient-type.util';
import { saveAs } from 'file-saver';

/**
 * `IngredientCategory` was harmonized to SCREAMING_SNAKE to match its Prisma
 * labels (#2473), which is correct for storage but leaks into the download
 * filename — `photo-IMAGE_EDIT-ing-123.png`. Filenames are product language, so
 * the category is rendered back into the kebab-case spelling users saw before.
 */
function formatCategoryForFilename(category: string): string {
  return category.toLowerCase().replace(/_/g, '-');
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
      `${metadataLabel || 'genfeed'}-${formatCategoryForFilename(ingredient.category)}-${ingredient.id}.${extension}`,
    );
  } catch {
    // Fallback: use anchor element for cross-origin downloads
    const link = document.createElement('a');
    link.href = ingredient.ingredientUrl;
    link.download = `${(ingredient.metadata as IMetadata)?.label || 'genfeed'}-${formatCategoryForFilename(ingredient.category)}-${ingredient.id}`;
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
