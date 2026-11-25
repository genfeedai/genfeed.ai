import type { IngredientStatus } from '@genfeedai/contracts';
import { del, get, patch, post } from './client';
import { flattenCollection, flattenSingle, type JsonApiDocument } from './json-api';

export interface Asset {
  brandId?: string;
  category: string;
  cdnUrl?: string;
  createdAt?: string;
  folderId?: string | null;
  height?: number;
  id: string;
  model?: string;
  status: IngredientStatus;
  text?: string;
  width?: number;
}

export interface ListAssetsOptions {
  brandId?: string;
  category?: string;
  limit?: number;
}

export async function listAssets(options: ListAssetsOptions = {}): Promise<Asset[]> {
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 20), 1), 100);
  const query = new URLSearchParams({ limit: String(limit) });
  if (options.brandId) query.set('brandId', options.brandId);
  if (options.category) query.set('categories', options.category);
  const response = await get<JsonApiDocument>(`/ingredients?${query.toString()}`);
  return flattenCollection<Asset>(response);
}

export async function getAsset(id: string): Promise<Asset> {
  const response = await get<JsonApiDocument>(`/ingredients/batch?ids=${encodeURIComponent(id)}`);
  const asset = flattenCollection<Asset>(response)[0];
  if (!asset) throw new Error(`Asset ${id} was not found`);
  return asset;
}

/** Deletes one Library asset, then reads it back; true when it no longer resolves. */
export async function deleteAsset(id: string): Promise<boolean> {
  await del(`/ingredients/${encodeURIComponent(id)}`);
  const response = await get<JsonApiDocument>(`/ingredients/batch?ids=${encodeURIComponent(id)}`);
  return flattenCollection<Asset>(response).length === 0;
}

export interface UploadSlotRequest {
  contentType: string;
  filename: string;
  sizeBytes: number;
}

/** A pending Library asset and the place its bytes go. */
export interface UploadSlot {
  /** Pending asset id; the same id is confirmed once the bytes are stored. */
  id: string;
  s3Key: string;
  uploadUrl: string;
}

/**
 * Reserves a pending Library asset. The server picks the media category from
 * the file type, checks the type and size against its own limits, and refuses
 * what it does not accept, so the CLI keeps no list of either.
 */
export async function requestUploadSlot(request: UploadSlotRequest): Promise<UploadSlot> {
  const response = await post<JsonApiDocument>('/ingredients/upload/presigned', {
    category: 'INGREDIENT',
    ...request,
  });
  return flattenSingle<UploadSlot>(response);
}

/** Finalizes an upload once its bytes are stored. */
export async function confirmUpload(id: string): Promise<Asset> {
  const response = await post<JsonApiDocument>(
    `/ingredients/upload/confirm/${encodeURIComponent(id)}`
  );
  return flattenSingle<Asset>(response);
}

/** Reads a folder; the API answers 404 when it is not in the active brand. */
export async function getFolder(id: string): Promise<{ id: string; label?: string }> {
  const response = await get<JsonApiDocument>(`/folders/${encodeURIComponent(id)}`);
  return flattenSingle<{ id: string; label?: string }>(response);
}

export async function moveAssetToFolder(id: string, folderId: string): Promise<void> {
  await patch<JsonApiDocument>(`/ingredients/${encodeURIComponent(id)}`, { folderId });
}
