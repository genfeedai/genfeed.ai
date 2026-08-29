import { type Asset, getAsset, listAssets } from '@/api/assets';
import { getActiveBrand } from '@/config/store';

export async function readAssets(
  options: { category?: string; limit?: number } = {}
): Promise<Asset[]> {
  return await listAssets({ ...options, brandId: await getActiveBrand() });
}

export async function readAsset(id: string): Promise<Asset> {
  return await getAsset(id);
}
