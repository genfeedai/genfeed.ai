import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listMock } = vi.hoisted(() => ({ listMock: vi.fn() }));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ getToken: vi.fn() }),
}));

vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: async () => 'token',
}));

vi.mock('@genfeedai/services/content/content-plans.service', () => ({
  ContentPlansService: { getInstance: () => ({ list: listMock }) },
}));

import { useContentPlans } from './use-content-plans';

describe('useContentPlans', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMock.mockResolvedValue([{ id: 'plan-1' }]);
  });

  it('requests the given server page for the brand', async () => {
    const { result } = renderHook(
      () => useContentPlans({ brandId: 'brand-1', limit: 15, page: 2 }),
      { wrapper: createQueryWrapper() },
    );

    await waitFor(() => expect(result.current.plans).toHaveLength(1));
    expect(listMock).toHaveBeenCalledWith(
      'brand-1',
      { limit: 15, page: 2 },
      expect.any(AbortSignal),
    );
  });

  it('stays idle without a brand', () => {
    renderHook(() => useContentPlans({}), { wrapper: createQueryWrapper() });

    expect(listMock).not.toHaveBeenCalled();
  });
});
