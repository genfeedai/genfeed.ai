import type { IIngredient, IMetadata } from '@genfeedai/contracts/interfaces';
import {
  extensionForImageContentType,
  getIngredientExtension,
} from '@genfeedai/helpers/media/ingredient-type.helper';
import { saveAs } from 'file-saver';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

function startsWithBytes(
  bytes: Uint8Array,
  signature: readonly number[],
): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function asciiAt(bytes: Uint8Array, start: number, end: number): string {
  let text = '';
  const last = Math.min(end, bytes.length);
  for (let index = start; index < last; index += 1) {
    text += String.fromCharCode(bytes[index] ?? 0);
  }
  return text;
}

// PNG, JPEG, GIF, and WebP signatures already accepted for stored image bytes.
function extensionFromTrustedImageBytes(bytes: Uint8Array): string | undefined {
  if (startsWithBytes(bytes, PNG_SIGNATURE)) {
    return 'png';
  }
  if (startsWithBytes(bytes, JPEG_SIGNATURE)) {
    return 'jpg';
  }
  const header = asciiAt(bytes, 0, 6);
  if (header === 'GIF87a' || header === 'GIF89a') {
    return 'gif';
  }
  if (asciiAt(bytes, 0, 4) === 'RIFF' && asciiAt(bytes, 8, 12) === 'WEBP') {
    return 'webp';
  }
  return undefined;
}

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
  bytes?: Uint8Array,
): string {
  const metadata = ingredient.metadata as IMetadata | undefined;
  const extension =
    (bytes ? extensionFromTrustedImageBytes(bytes) : undefined) ??
    extensionForImageContentType(mimeType) ??
    getIngredientExtension(ingredient);
  return `${metadata?.label || 'genfeed'}-${formatCategoryForFilename(ingredient.category)}-${ingredient.id}.${extension}`;
}

export async function ingredientDownloadFilenameForBlob(
  ingredient: IIngredient,
  blob: Blob,
): Promise<string> {
  const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  return ingredientDownloadFilename(ingredient, blob.type, bytes);
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
  saveDownloadBlob(
    blob,
    await ingredientDownloadFilenameForBlob(ingredient, blob),
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
