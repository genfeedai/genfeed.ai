import { openAsBlob } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import {
  type Asset,
  confirmUpload,
  getAsset,
  getFolder,
  moveAssetToFolder,
  requestUploadSlot,
  type UploadSlot,
} from '@/api/assets';
import { getAppUrl } from '@/config/store';
import { GenfeedError } from '@/utils/errors';

/** One storage transfer may be a large video on a slow link. */
const TRANSFER_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Content type a browser would declare for a file. It is a lookup, not an
 * allowlist: an extension that is not here goes up as `application/octet-stream`
 * and the server decides whether it accepts it.
 */
const CONTENT_TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.aac': 'audio/aac',
  '.avi': 'video/x-msvideo',
  '.flac': 'audio/flac',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.m4a': 'audio/mp4',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.ogv': 'video/ogg',
  '.png': 'image/png',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
};

export interface UploadAssetOptions {
  /** Library folder to file the asset in; checked before any bytes move. */
  folderId?: string;
}

export interface UploadedAsset {
  asset: Asset;
  /** Library page that lists the asset (its folder when one was chosen). */
  libraryUrl: string;
  path: string;
}

export function resolveContentType(path: string): string {
  return CONTENT_TYPE_BY_EXTENSION[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

/** Self-hosted servers take the bytes as JSON on the Files service, not a signed PUT. */
function isLocalUploadUrl(uploadUrl: string): boolean {
  return uploadUrl.includes('/v1/files/upload') && !uploadUrl.includes('s3.amazonaws.com');
}

async function failTransfer(response: Response): Promise<never> {
  const detail = (await response.text().catch(() => '')).slice(0, 200);
  throw new GenfeedError(
    `Storage refused the upload (HTTP ${response.status})${detail ? `: ${detail}` : ''}`
  );
}

/** Sends the bytes to the slot's URL. The API key never goes to the storage host. */
async function transferFile(slot: UploadSlot, path: string, contentType: string): Promise<void> {
  if (isLocalUploadUrl(slot.uploadUrl)) {
    // The key is `ingredients/<type>/<id>`; the Files service wants the type.
    const type = slot.s3Key.split('/')[1];
    const data = (await readFile(path)).toString('base64');
    const response = await fetch(slot.uploadUrl, {
      body: JSON.stringify({
        key: slot.id,
        source: { contentType, data: `data:${contentType};base64,${data}`, type: 'base64' },
        type,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      signal: AbortSignal.timeout(TRANSFER_TIMEOUT_MS),
    });
    if (!response.ok) await failTransfer(response);
    return;
  }

  const response = await fetch(slot.uploadUrl, {
    body: await openAsBlob(path, { type: contentType }),
    headers: { 'Content-Type': contentType },
    method: 'PUT',
    signal: AbortSignal.timeout(TRANSFER_TIMEOUT_MS),
  });
  if (!response.ok) await failTransfer(response);
}

async function readFileSize(path: string): Promise<number> {
  try {
    const info = await stat(path);
    if (!info.isFile()) throw new GenfeedError(`${path} is not a file`);
    return info.size;
  } catch (error) {
    if (error instanceof GenfeedError) throw error;
    throw new GenfeedError(`Cannot read ${path}`, 'Check the path and its permissions');
  }
}

async function buildLibraryUrl(folderId: string | undefined): Promise<string> {
  const url = new URL('/library/assets', await getAppUrl());
  if (folderId) url.searchParams.set('folder', folderId);
  return url.toString();
}

/**
 * Uploads one local file to the Library: reserve a pending asset, send the
 * bytes, confirm, then file it in the folder. The returned asset is read back
 * from the API, so it is what the Library holds now.
 */
export async function uploadAssetFile(
  path: string,
  options: UploadAssetOptions = {}
): Promise<UploadedAsset> {
  const absolutePath = resolve(path);
  const sizeBytes = await readFileSize(absolutePath);
  if (options.folderId) await getFolder(options.folderId);

  const contentType = resolveContentType(absolutePath);
  const slot = await requestUploadSlot({
    contentType,
    filename: basename(absolutePath),
    sizeBytes,
  });
  await transferFile(slot, absolutePath, contentType);
  const confirmed = await confirmUpload(slot.id);
  if (options.folderId) {
    try {
      await moveAssetToFolder(confirmed.id, options.folderId);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new GenfeedError(
        `Uploaded as ${confirmed.id}, but could not file it in folder ${options.folderId}: ${reason}`,
        `Move it in the Library, or run \`gf asset delete ${confirmed.id}\``
      );
    }
  }

  return {
    asset: await getAsset(confirmed.id),
    libraryUrl: await buildLibraryUrl(options.folderId),
    path,
  };
}
