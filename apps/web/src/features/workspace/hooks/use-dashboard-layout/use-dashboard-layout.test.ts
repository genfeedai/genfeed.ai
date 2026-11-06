import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type StoredLayout = {
  brandId: string;
  id: string;
  pageKey: string;
  widgets: string[];
};

// In-memory dashboard-layouts API keyed by brand and page. `reads` logs each
// fetch so a test can tell a cached render from a real request.
const api = vi.hoisted(() => ({
  brandId: 'brand-ctx' as string | undefined,
  isSignedIn: true,
  layouts: [] as StoredLayout[],
  reads: [] as string[],
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: api.brandId }),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ isSignedIn: api.isSignedIn }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    findForPage: async (brandId: string, pageKey: string) => {
      api.reads.push(`${brandId}/${pageKey}`);
      const layout = api.layouts.find(
        (item) => item.brandId === brandId && item.pageKey === pageKey,
      );
      return layout ? { id: layout.id, widgets: layout.widgets } : null;
    },
    removeLayout: async (id: string) => {
      api.layouts = api.layouts.filter((item) => item.id !== id);
    },
  }),
}));

vi.mock('@genfeedai/services/content/dashboard-layouts.service', () => ({
  DashboardLayoutsService: { getInstance: () => ({}) },
}));

import { useDashboardLayout } from './use-dashboard-layout';

describe('useDashboardLayout', () => {
  beforeEach(() => {
    api.brandId = 'brand-ctx';
    api.isSignedIn = true;
    api.layouts = [
      {
        brandId: 'brand-ctx',
        id: 'layout-1',
        pageKey: 'workspace-overview',
        widgets: [],
      },
      {
        brandId: 'brand-9',
        id: 'layout-9',
        pageKey: 'custom-page',
        widgets: ['reach'],
      },
    ];
    api.reads = [];
  });

  it('loads the layout for the context brand and default page key', async () => {
    const { result } = renderHook(() => useDashboardLayout(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.layout).toEqual({ id: 'layout-1', widgets: [] });
    });
  });

  it('prefers an explicit brand id and page key', async () => {
    const { result } = renderHook(
      () => useDashboardLayout({ brandId: 'brand-9', pageKey: 'custom-page' }),
      { wrapper: createQueryWrapper() },
    );

    await waitFor(() => {
      expect(result.current.layout).toEqual({
        id: 'layout-9',
        widgets: ['reach'],
      });
    });
  });

  it('does not fetch when signed out', () => {
    api.isSignedIn = false;

    const { result } = renderHook(() => useDashboardLayout(), {
      wrapper: createQueryWrapper(),
    });

    expect(result.current.layout).toBeUndefined();
    expect(api.reads).toEqual([]);
  });

  it('does not fetch without a brand id', () => {
    api.brandId = undefined;

    const { result } = renderHook(() => useDashboardLayout(), {
      wrapper: createQueryWrapper(),
    });

    expect(result.current.layout).toBeUndefined();
    expect(api.reads).toEqual([]);
  });

  it('resets the layout and shows the default again', async () => {
    const { result } = renderHook(() => useDashboardLayout(), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => {
      expect(result.current.layout).toEqual({ id: 'layout-1', widgets: [] });
    });

    await act(async () => {
      await result.current.resetLayout();
    });

    expect(api.layouts.map((layout) => layout.id)).toEqual(['layout-9']);
    await waitFor(() => {
      expect(result.current.layout).toBeNull();
    });
  });

  it('skips reset when there is no layout', async () => {
    api.brandId = 'brand-without-layout';
    const { result } = renderHook(() => useDashboardLayout(), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.resetLayout();
    });

    expect(api.layouts).toHaveLength(2);
  });

  it('refresh picks up a layout changed on the server', async () => {
    const { result } = renderHook(() => useDashboardLayout(), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => {
      expect(result.current.layout).toEqual({ id: 'layout-1', widgets: [] });
    });

    api.layouts[0].widgets = ['followers'];
    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current.layout).toEqual({
        id: 'layout-1',
        widgets: ['followers'],
      });
    });
  });
});
