import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFindForPage = vi.fn();
const mockRemoveLayout = vi.fn();
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

vi.mock('@genfeedai/services/content/dashboard-layouts.service', () => ({
  DashboardLayoutsService: { getInstance: vi.fn() },
}));

import { useDashboardLayout } from './use-dashboard-layout';

const LAYOUT = { id: 'layout-1', widgets: [] };

describe('useDashboardLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindForPage.mockResolvedValue(LAYOUT);
    mockRemoveLayout.mockResolvedValue(undefined);
    mockGetService.mockResolvedValue({
      findForPage: mockFindForPage,
      removeLayout: mockRemoveLayout,
    });
    mockUseBrand.mockReturnValue({ brandId: 'brand-ctx' });
    mockUseAuthIdentity.mockReturnValue({ isSignedIn: true });
  });

  it('loads the layout for the context brand and default page key', async () => {
    const { result } = renderHook(() => useDashboardLayout(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFindForPage).toHaveBeenCalledWith(
      'brand-ctx',
      'workspace-overview',
    );
    expect(result.current.layout).toEqual(LAYOUT);
  });

  it('prefers an explicit brand id and page key', async () => {
    const { result } = renderHook(
      () => useDashboardLayout({ brandId: 'brand-9', pageKey: 'custom-page' }),
      { wrapper: createQueryWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFindForPage).toHaveBeenCalledWith('brand-9', 'custom-page');
  });

  it('does not fetch when signed out', () => {
    mockUseAuthIdentity.mockReturnValue({ isSignedIn: false });

    renderHook(() => useDashboardLayout(), {
      wrapper: createQueryWrapper(),
    });

    expect(mockGetService).not.toHaveBeenCalled();
  });

  it('does not fetch without a brand id', () => {
    mockUseBrand.mockReturnValue({ brandId: undefined });

    renderHook(() => useDashboardLayout(), {
      wrapper: createQueryWrapper(),
    });

    expect(mockGetService).not.toHaveBeenCalled();
  });

  it('resets the layout and invalidates the query', async () => {
    const { result } = renderHook(() => useDashboardLayout(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.layout).toEqual(LAYOUT);
    });

    await act(async () => {
      await result.current.resetLayout();
    });

    expect(mockRemoveLayout).toHaveBeenCalledWith('layout-1');
  });

  it('skips reset when there is no layout', async () => {
    mockFindForPage.mockResolvedValue(null);

    const { result } = renderHook(() => useDashboardLayout(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.resetLayout();
    });

    expect(mockRemoveLayout).not.toHaveBeenCalled();
  });

  it('refresh triggers a refetch', async () => {
    const { result } = renderHook(() => useDashboardLayout(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    mockFindForPage.mockClear();

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(mockFindForPage).toHaveBeenCalled();
    });
  });
});
