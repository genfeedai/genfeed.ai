import { useAgentBrandCreate } from '@hooks/agent/use-agent-brand-create/use-agent-brand-create';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPost = vi.fn();
const mockRefreshBrands = vi.fn();
const mockGetInstance = vi.fn(() => ({ post: mockPost }));

vi.mock('@services/social/brands.service', () => ({
  BrandsService: {
    getInstance: (token: string) => mockGetInstance(token),
  },
}));

// Identity constructor so we can assert on the payload passed to `post`.
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
    refreshBrands: mockRefreshBrands,
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => async () =>
    factory('test-token'),
}));

describe('useAgentBrandCreate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockResolvedValue({ id: 'brand-1' });
    mockRefreshBrands.mockResolvedValue(undefined);
  });

  it('creates a brand with the trimmed label/description and active org', async () => {
    const { result } = renderHook(() => useAgentBrandCreate());

    await act(async () => {
      await result.current({ name: '  Acme  ', description: '  A brand  ' });
    });

    expect(mockGetInstance).toHaveBeenCalledWith('test-token');
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost.mock.calls[0][0]).toMatchObject({
      description: 'A brand',
      isDeleted: false,
      isSelected: false,
      label: 'Acme',
      organizationId: 'org-1',
    });
    expect(mockRefreshBrands).toHaveBeenCalledTimes(1);
  });

  it('rejects and does not post when the name is blank', async () => {
    const { result } = renderHook(() => useAgentBrandCreate());

    await expect(
      result.current({ name: '   ', description: 'x' }),
    ).rejects.toThrow('Brand name is required.');
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('propagates create failures to the caller', async () => {
    mockPost.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useAgentBrandCreate());

    await expect(
      result.current({ name: 'Acme', description: '' }),
    ).rejects.toThrow('boom');
  });
});
