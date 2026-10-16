import type { IIngredient, IMetadata } from '@genfeedai/contracts/interfaces';
import {
  getIngredientExtension,
  isImageIngredient,
} from '@utils/media/ingredient-type.util';
import { saveAs } from 'file-saver';

const IMAGE_EXTENSIONS_BY_MIME = new Map([
  ['image/avif', 'avif'],
  ['image/gif', 'gif'],
  ['image/heic', 'heic'],
  ['image/heif', 'heif'],
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);
const IMAGE_EXTENSIONS = new Set([
  ...IMAGE_EXTENSIONS_BY_MIME.values(),
  'jpeg',
]);

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

export function ingredientDownloadFilename(
  ingredient: IIngredient,
  mimeType?: string,
): string {
  const metadata = ingredient.metadata as IMetadata | undefined;
  const rawExtension = ingredient.metadataExtension ?? metadata?.extension;
  const metadataExtension =
    typeof rawExtension === 'string'
      ? rawExtension.trim().toLowerCase().replace(/^\./, '')
      : '';
  const mimeExtension = IMAGE_EXTENSIONS_BY_MIME.get(
    (mimeType || ingredient.mimeType || '')
      .split(';', 1)[0]
      .trim()
      .toLowerCase(),
  );
  const extension =
    mimeExtension ??
    (isImageIngredient(ingredient) && IMAGE_EXTENSIONS.has(metadataExtension)
      ? metadataExtension
      : getIngredientExtension(ingredient));
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
  const blob = await fetchDownloadBlob(originalUrl);
  saveDownloadBlob(blob, ingredientDownloadFilename(ingredient, blob.type));
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
