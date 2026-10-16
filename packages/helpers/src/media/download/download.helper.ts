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

export function sanitizeDownloadFilename(filename: string): string {
  const trimmed = filename.trim() || 'download';
  return trimmed.replace(/[/\\?%*:|"<>]/g, '-').slice(0, 180);
}

export function ingredientDownloadFilename(ingredient: IIngredient): string {
  const extension = getIngredientExtension(ingredient);
  const metadata = ingredient.metadata as IMetadata | undefined;
  return `${metadata?.label || 'genfeed'}-${formatCategoryForFilename(ingredient.category)}-${ingredient.id}.${extension}`;
}

export function filenameFromContentDisposition(
  contentDisposition: string | undefined,
): string | undefined {
  if (!contentDisposition) {
    return undefined;
  }
  const utfMatch = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1]);
    } catch {
      return utfMatch[1];
    }
  }
  const quoted = /filename="([^"]+)"/i.exec(contentDisposition);
  if (quoted?.[1]) {
    return quoted[1];
  }
  const unquoted = /filename=([^;]+)/i.exec(contentDisposition);
  return unquoted?.[1]?.trim();
}

export function saveDownloadBlob(blob: Blob, filename: string): void {
  saveAs(blob, sanitizeDownloadFilename(filename));
}

async function fetchDownloadBlob(url: string): Promise<Blob> {
  const response = await fetch(url, {
    cache: 'no-store',
    credentials: 'omit',
    mode: 'cors',
  });
  if (!response.ok) {
    throw new Error(`Failed to download file (status ${response.status})`);
  }
  return response.blob();
}

export async function downloadIngredient(
  ingredient: IIngredient,
  originalUrl: string,
): Promise<void> {
  if (!originalUrl) {
    throw new Error('No download URL available');
  }
  saveDownloadBlob(
    await fetchDownloadBlob(originalUrl),
    ingredientDownloadFilename(ingredient),
  );
}

export async function downloadUrl(
  url: string,
  filename?: string,
): Promise<void> {
  if (!url) {
    throw new Error('No download URL available');
  }
  saveDownloadBlob(await fetchDownloadBlob(url), filename || 'download');
}
