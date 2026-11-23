import type { IngredientStatus } from '@genfeedai/contracts';
import { del, get } from './client';
import { flattenCollection, type JsonApiDocument } from './json-api';

export interface Asset {
  brandId?: string;
  category: string;
  cdnUrl?: string;
  createdAt?: string;
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
