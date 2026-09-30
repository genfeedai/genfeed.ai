import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFindAll = vi.fn();
const mockGetService = vi.fn();
const mockUseAuthIdentity = vi.fn();

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
    mockUseAuthIdentity.mockReturnValue({ isSignedIn: true });
  });

  it('loads engagement rules for the current target', async () => {
    const { result } = renderHook(
      () =>
        useEngagementRules({ postGroupId: 'group-1', targetId: 'target-1' }),
      {
        wrapper: createQueryWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFindAll).toHaveBeenCalledWith(
      { postGroupId: 'group-1', targetId: 'target-1' },
      expect.any(AbortSignal),
    );
    expect(result.current.rules).toEqual([RULE]);
  });

  it('does not fetch when signed out', () => {
    mockUseAuthIdentity.mockReturnValue({ isSignedIn: false });

    renderHook(
      () =>
        useEngagementRules({ postGroupId: 'group-1', targetId: 'target-1' }),
      { wrapper: createQueryWrapper() },
    );

    expect(mockGetService).not.toHaveBeenCalled();
  });

  it('does not fetch without a post group and target', () => {
    renderHook(() => useEngagementRules(), { wrapper: createQueryWrapper() });

    expect(mockGetService).not.toHaveBeenCalled();
  });

  it('refresh triggers a refetch', async () => {
    const { result } = renderHook(
      () =>
        useEngagementRules({ postGroupId: 'group-1', targetId: 'target-1' }),
      {
        wrapper: createQueryWrapper(),
      },
    );

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
