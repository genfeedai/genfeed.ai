import { paginatedResponse } from '@app-tests/paginated-response';
// @vitest-environment jsdom
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStudioClipperProjects } from './useStudioClipperProjects';

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(),
  listProjects: vi.fn(),
  updateProject: vi.fn(),
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
  useAuthIdentity: () => ({ getToken: mocks.getToken }),
}));

vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: vi.fn().mockResolvedValue('token'),
}));

vi.mock('./services/clipper-api.service', () => ({
  ClipperApiService: class {
    listProjects = mocks.listProjects;
    updateProject = mocks.updateProject;
  },
}));

describe('useStudioClipperProjects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams();
    mocks.selectedBrandId = 'brand-1';
    mocks.updateProject.mockResolvedValue(undefined);
    mocks.listProjects.mockResolvedValue(
      paginatedResponse([], { totalDocs: 61, totalPages: 5 }),
    );
  });

  it('requests the first server page for the selected brand', async () => {
    const { result } = renderHook(() => useStudioClipperProjects());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mocks.listProjects).toHaveBeenCalledWith(
      { brandId: 'brand-1', limit: ITEMS_PER_PAGE, page: 1 },
      expect.any(AbortSignal),
    );
  });

  it('asks the server for the q search term', async () => {
    mocks.searchParams = new URLSearchParams('q=launch');

    const { result } = renderHook(() => useStudioClipperProjects());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mocks.listProjects).toHaveBeenCalledWith(
      {
        brandId: 'brand-1',
        limit: ITEMS_PER_PAGE,
        page: 1,
        search: 'launch',
      },
      expect.any(AbortSignal),
    );
  });

  it('requests the page named in the URL and keeps the rows the API returned', async () => {
    mocks.searchParams = new URLSearchParams('page=3');
    mocks.listProjects.mockResolvedValue(
      paginatedResponse(
        [{ brandId: 'brand-2', id: 'clip-1', name: 'Other brand' }],
        { totalDocs: 61, totalPages: 5 },
      ),
    );

    const { result } = renderHook(() => useStudioClipperProjects());

    await waitFor(() => expect(result.current.projects).toHaveLength(1));
    expect(result.current.pageTotals).toEqual({ totalDocs: 61, totalPages: 5 });
    expect(mocks.listProjects).toHaveBeenCalledWith(
      { brandId: 'brand-1', limit: ITEMS_PER_PAGE, page: 3 },
      expect.any(AbortSignal),
    );
  });

  it('preserves the server totals through project rename and removal', async () => {
    mocks.listProjects.mockResolvedValue(
      paginatedResponse([{ id: 'clip-1', name: 'Original' }], {
        totalDocs: 61,
        totalPages: 5,
      }),
    );
    const { result } = renderHook(() => useStudioClipperProjects());
    await waitFor(() => expect(result.current.projects).toHaveLength(1));
    await act(async () => {
      await result.current.renameProject('clip-1', 'Renamed');
    });
    expect(result.current.projects[0]?.name).toBe('Renamed');
    expect(result.current.pageTotals).toEqual({ totalDocs: 61, totalPages: 5 });
    await act(async () => {
      await result.current.deleteProject('clip-1');
    });
    expect(result.current.projects).toEqual([]);
    expect(result.current.pageTotals).toEqual({ totalDocs: 61, totalPages: 5 });
  });

  it('does not fetch while disabled', async () => {
    const { result } = renderHook(() =>
      useStudioClipperProjects({ isEnabled: false }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mocks.listProjects).not.toHaveBeenCalled();
  });
});
