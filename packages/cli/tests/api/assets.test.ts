import { IngredientStatus } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteAsset, getAsset, listAssets } from '../../src/api/assets';

const mockFetch = vi.fn();

vi.mock('../../src/config/store', () => ({
  getApiKey: () => 'gf_test_key',
  getApiUrl: () => 'https://api.genfeed.ai/v1',
}));

vi.mock('ofetch', () => ({ ofetch: { create: () => mockFetch } }));

describe('api/assets', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists scoped assets with filters', async () => {
    mockFetch.mockResolvedValue({
      data: [
        {
          attributes: { category: 'IMAGE', status: IngredientStatus.GENERATED },
          id: 'asset-1',
          type: 'ingredient',
        },
      ],
    });
    const assets = await listAssets({ brandId: 'brand-1', category: 'image', limit: 500 });
    expect(mockFetch).toHaveBeenCalledWith(
      '/ingredients?limit=100&brandId=brand-1&categories=image',
      { method: 'GET' }
    );
    expect(assets[0].id).toBe('asset-1');
  });

  it('loads one asset through the batch read route', async () => {
    mockFetch.mockResolvedValue({
      data: [
        { attributes: { cdnUrl: 'https://cdn/asset.jpg' }, id: 'asset-1', type: 'ingredient' },
      ],
    });
    expect((await getAsset('asset-1')).cdnUrl).toBe('https://cdn/asset.jpg');
  });

  it('rejects a missing asset', async () => {
    mockFetch.mockResolvedValue({ data: [] });
    await expect(getAsset('missing')).rejects.toThrow('Asset missing was not found');
  });

  it('deletes an asset and reports whether the read-back still finds it', async () => {
    const requests: string[] = [];
    let remaining: unknown[] = [];
    mockFetch.mockImplementation(async (path: string, init: { method: string }) => {
      requests.push(`${init.method} ${path}`);
      return init.method === 'GET' ? { data: remaining } : {};
    });

    await expect(deleteAsset('asset-1')).resolves.toBe(true);
    remaining = [{ attributes: {}, id: 'asset-1', type: 'ingredient' }];
    await expect(deleteAsset('asset-1')).resolves.toBe(false);
    expect(requests.slice(0, 2)).toEqual([
      'DELETE /ingredients/asset-1',
      'GET /ingredients/batch?ids=asset-1',
    ]);
  });
});
