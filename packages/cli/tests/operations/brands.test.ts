import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetOrganizationId, mockListBrands, mockSetActiveBrand } = vi.hoisted(() => ({
  mockGetOrganizationId: vi.fn(),
  mockListBrands: vi.fn(),
  mockSetActiveBrand: vi.fn(),
}));

vi.mock('../../src/api/brands', () => ({
  listBrands: (organizationId: string) => mockListBrands(organizationId),
}));

vi.mock('../../src/config/store', () => ({
  getOrganizationId: () => mockGetOrganizationId(),
  setActiveBrand: (id: string) => mockSetActiveBrand(id),
}));

describe('brand operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrganizationId.mockResolvedValue('org-1');
    mockListBrands.mockResolvedValue([
      { id: 'brand-1', label: 'Acme', slug: 'acme' },
      { id: 'brand-2', label: 'Northwind', slug: 'northwind' },
    ]);
  });

  it('lists brands only through the active organization scope', async () => {
    const { readBrands } = await import('../../src/operations/brands');

    const brands = await readBrands();

    expect(mockListBrands).toHaveBeenCalledWith('org-1');
    expect(brands).toHaveLength(2);
  });

  it.each(['brand-1', 'acme', 'ACME'])(
    'resolves and persists a unique brand reference %s',
    async (reference) => {
      const { activateBrand } = await import('../../src/operations/brands');

      const brand = await activateBrand(reference);

      expect(brand.id).toBe('brand-1');
      expect(mockSetActiveBrand).toHaveBeenCalledWith('brand-1');
    }
  );

  it('rejects ambiguous labels without changing scope', async () => {
    mockListBrands.mockResolvedValue([
      { id: 'brand-1', label: 'Acme' },
      { id: 'brand-2', label: 'Acme' },
    ]);
    const { activateBrand } = await import('../../src/operations/brands');

    await expect(activateBrand('acme')).rejects.toThrow('matches more than one brand');
    expect(mockSetActiveBrand).not.toHaveBeenCalled();
  });

  it('gives an exact brand ID precedence over another brand label', async () => {
    mockListBrands.mockResolvedValue([
      { id: 'brand-1', label: 'Primary' },
      { id: 'brand-2', label: 'brand-1' },
    ]);
    const { activateBrand } = await import('../../src/operations/brands');

    await expect(activateBrand('brand-1')).resolves.toEqual({ id: 'brand-1', label: 'Primary' });
    expect(mockSetActiveBrand).toHaveBeenCalledWith('brand-1');
  });

  it('rejects a missing organization or brand', async () => {
    const { activateBrand, readBrands } = await import('../../src/operations/brands');
    mockGetOrganizationId.mockResolvedValueOnce(undefined);
    await expect(readBrands()).rejects.toThrow('No organization found');
    mockListBrands.mockResolvedValueOnce([]);
    await expect(activateBrand('missing')).rejects.toThrow('No brand matches');
  });
});
