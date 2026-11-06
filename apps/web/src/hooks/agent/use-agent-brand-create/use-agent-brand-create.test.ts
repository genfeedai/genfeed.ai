import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentBrandCreate } from '@/hooks/agent/use-agent-brand-create/use-agent-brand-create';

type StoredBrand = Record<string, unknown> & { token: string };

// In-memory stand-in for the brands API: `post` persists what the hook sends,
// `refreshBrands` re-reads it into the brand context the UI renders from.
const server = vi.hoisted(() => ({
  brands: [] as StoredBrand[],
  failNextPost: null as Error | null,
  visibleBrands: [] as StoredBrand[],
}));

vi.mock('@services/social/brands.service', () => ({
  BrandsService: {
    getInstance: (token: string) => ({
      post: async (brand: Record<string, unknown>) => {
        if (server.failNextPost) {
          const error = server.failNextPost;
          server.failNextPost = null;
          throw error;
        }
        server.brands.push({ ...brand, token });
        return { id: `brand-${server.brands.length}` };
      },
    }),
  },
}));

// Identity constructor so the persisted record is the payload passed to `post`.
vi.mock('@models/organization/brand.model', () => ({
  Brand: class {
    constructor(data: Record<string, unknown>) {
      Object.assign(this, data);
    }
  },
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    organizationId: 'org-1',
    refreshBrands: async () => {
      server.visibleBrands = [...server.brands];
    },
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => async () =>
    factory('test-token'),
}));

describe('useAgentBrandCreate', () => {
  beforeEach(() => {
    server.brands = [];
    server.failNextPost = null;
    server.visibleBrands = [];
  });

  it('persists a brand with the trimmed label/description in the active org and makes it selectable', async () => {
    const { result } = renderHook(() => useAgentBrandCreate());

    await act(async () => {
      await result.current({ name: '  Acme  ', description: '  A brand  ' });
    });

    expect(server.brands).toEqual([
      expect.objectContaining({
        description: 'A brand',
        isDeleted: false,
        label: 'Acme',
        organizationId: 'org-1',
        token: 'test-token',
      }),
    ]);
    expect(server.visibleBrands).toEqual(server.brands);
  });

  it('rejects and persists nothing when the name is blank', async () => {
    const { result } = renderHook(() => useAgentBrandCreate());

    await expect(
      result.current({ name: '   ', description: 'x' }),
    ).rejects.toThrow('Brand name is required.');
    expect(server.brands).toEqual([]);
  });

  it('propagates create failures to the caller', async () => {
    server.failNextPost = new Error('boom');
    const { result } = renderHook(() => useAgentBrandCreate());

    await expect(
      result.current({ name: 'Acme', description: '' }),
    ).rejects.toThrow('boom');
    expect(server.brands).toEqual([]);
  });
});
