import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetActiveBrand, mockGetAsset, mockListAssets } = vi.hoisted(() => ({
  mockGetActiveBrand: vi.fn(),
  mockGetAsset: vi.fn(),
  mockListAssets: vi.fn(),
}));

vi.mock('../../src/api/assets', () => ({
  getAsset: (...args: unknown[]) => mockGetAsset(...args),
  listAssets: (...args: unknown[]) => mockListAssets(...args),
}));

vi.mock('../../src/config/store', () => ({
  getActiveBrand: () => mockGetActiveBrand(),
}));

describe('asset operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActiveBrand.mockResolvedValue('brand-1');
    mockListAssets.mockResolvedValue([{ id: 'asset-1' }]);
    mockGetAsset.mockResolvedValue({ id: 'asset-1' });
  });

  it('lists within the active brand', async () => {
    const { readAssets } = await import('../../src/operations/assets');
    expect(await readAssets({ category: 'image', limit: 10 })).toEqual([{ id: 'asset-1' }]);
    expect(mockListAssets).toHaveBeenCalledWith({
      brandId: 'brand-1',
      category: 'image',
      limit: 10,
    });
  });

  it('loads one asset', async () => {
    const { readAsset } = await import('../../src/operations/assets');
    expect(await readAsset('asset-1')).toEqual({ id: 'asset-1' });
  });
});
