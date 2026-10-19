// @vitest-environment jsdom
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStudioClipProjects } from './useStudioClipProjects';

const mocks = vi.hoisted(() => ({
  listProjects: vi.fn(),
  searchParams: new URLSearchParams(),
  selectedBrandId: 'brand-1' as string | undefined,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    selectedBrand: mocks.selectedBrandId
      ? { id: mocks.selectedBrandId }
      : undefined,
  }),
}));

vi.mock('@genfeedai/hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ getToken: vi.fn() }),
}));

vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: vi.fn().mockResolvedValue('token'),
}));

vi.mock('./services/clips-api.service', () => ({
  ClipsApiService: class {
    listProjects = mocks.listProjects;
    updateProject = vi.fn();
  },
}));

describe('useStudioClipProjects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams();
    mocks.selectedBrandId = 'brand-1';
    mocks.listProjects.mockResolvedValue([]);
  });

  it('requests the first server page for the selected brand', async () => {
    const { result } = renderHook(() => useStudioClipProjects());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mocks.listProjects).toHaveBeenCalledWith(
      { brandId: 'brand-1', limit: ITEMS_PER_PAGE, page: 1 },
      expect.any(AbortSignal),
    );
  });

  it('requests the page named in the URL and keeps the rows the API returned', async () => {
    mocks.searchParams = new URLSearchParams('page=3');
    mocks.listProjects.mockResolvedValue([
      { brandId: 'brand-2', id: 'clip-1', name: 'Other brand' },
    ]);

    const { result } = renderHook(() => useStudioClipProjects());

    await waitFor(() => expect(result.current.projects).toHaveLength(1));
    expect(mocks.listProjects).toHaveBeenCalledWith(
      { brandId: 'brand-1', limit: ITEMS_PER_PAGE, page: 3 },
      expect.any(AbortSignal),
    );
  });

  it('does not fetch while disabled', async () => {
    const { result } = renderHook(() =>
      useStudioClipProjects({ isEnabled: false }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mocks.listProjects).not.toHaveBeenCalled();
  });
});
