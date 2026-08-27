import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFindAll = vi.fn();
const mockGetService = vi.fn();
const mockUseBrand = vi.fn();
const mockUseAuthIdentity = vi.fn();

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => mockUseBrand(),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => mockUseAuthIdentity(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mockGetService,
}));

vi.mock('@genfeedai/services/content/engagement-rules.service', () => ({
  EngagementRulesService: { getInstance: vi.fn() },
}));

import { useEngagementRules } from './use-engagement-rules';

const RULE = { id: 'rule-1', postGroupId: 'group-1', threshold: 100 };

describe('useEngagementRules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindAll.mockResolvedValue([RULE]);
    mockGetService.mockResolvedValue({
      findAll: mockFindAll,
    });
    mockUseBrand.mockReturnValue({ brandId: 'brand-1' });
    mockUseAuthIdentity.mockReturnValue({ isSignedIn: true });
  });

  it('loads engagement rules for the current brand', async () => {
    const { result } = renderHook(() => useEngagementRules(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFindAll).toHaveBeenCalledWith(
      { brand: 'brand-1' },
      expect.any(AbortSignal),
    );
    expect(result.current.rules).toEqual([RULE]);
  });

  it('does not fetch when signed out', () => {
    mockUseAuthIdentity.mockReturnValue({ isSignedIn: false });

    renderHook(() => useEngagementRules(), { wrapper: createQueryWrapper() });

    expect(mockGetService).not.toHaveBeenCalled();
  });

  it('does not fetch without a brand id', () => {
    mockUseBrand.mockReturnValue({ brandId: undefined });

    renderHook(() => useEngagementRules(), { wrapper: createQueryWrapper() });

    expect(mockGetService).not.toHaveBeenCalled();
  });

  it('refresh triggers a refetch', async () => {
    const { result } = renderHook(() => useEngagementRules(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    mockFindAll.mockClear();

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(mockFindAll).toHaveBeenCalled();
    });
  });
});
