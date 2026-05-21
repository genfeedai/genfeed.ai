import { useAnalytics } from '@hooks/data/analytics/use-analytics/use-analytics';
import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Define PageScope type to match the actual enum
type PageScopeType = 'superadmin' | 'organization' | 'brand';

// Mock PageScope constant
const PageScope: Record<string, PageScopeType> = {
  BRAND: 'brand',
  ORGANIZATION: 'organization',
  SUPERADMIN: 'superadmin',
};

const mockFullAnalytics = {
  monthlyGrowth: 15,
  totalBrands: 2,
  totalCredentialsConnected: 5,
  totalPosts: 50,
  totalSubscriptions: 3,
  totalUsers: 10,
  totalViews: 5000,
  viewsGrowth: 25,
};

const mockFindAll = vi
  .fn()
  .mockResolvedValue({ ...mockFullAnalytics, totalPosts: 100 });
const mockFindBrandAnalytics = vi
  .fn()
  .mockResolvedValue({ ...mockFullAnalytics, totalPosts: 25 });
const mockFindOrganizationAnalytics = vi
  .fn()
  .mockResolvedValue(mockFullAnalytics);

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    brandId: 'brand-123',
    organizationId: 'org-123',
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn((factory: (token: string) => unknown) => {
    const factoryStr = factory.toString();
    if (factoryStr.includes('AnalyticsService')) {
      return vi.fn().mockResolvedValue({ findAll: mockFindAll });
    }
    if (factoryStr.includes('OrganizationsService')) {
      return vi.fn().mockResolvedValue({
        findOrganizationAnalytics: mockFindOrganizationAnalytics,
      });
    }
    if (factoryStr.includes('BrandsService')) {
      return vi.fn().mockResolvedValue({
        findBrandAnalytics: mockFindBrandAnalytics,
      });
    }
    return vi.fn().mockResolvedValue({});
  }),
}));

vi.mock('@helpers/data/cache/cache.helper', () => ({
  createCacheKey: vi.fn((...parts: unknown[]) => parts.join(':') as string),
  createLocalStorageCache: vi.fn(() => ({
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
  })),
}));

describe('useAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindAll.mockResolvedValue({ ...mockFullAnalytics, totalPosts: 100 });
    mockFindBrandAnalytics.mockResolvedValue({
      ...mockFullAnalytics,
      totalPosts: 25,
    });
    mockFindOrganizationAnalytics.mockResolvedValue(mockFullAnalytics);
  });

  describe('Initial State', () => {
    it('returns analytics data', async () => {
      const { result } = renderHook(
        () => useAnalytics({ scope: PageScope.ORGANIZATION }),
        { wrapper: createQueryWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.analytics).toBeDefined();
      expect(result.current.analytics.totalPosts).toBe(50);
    });

    it('returns loading states', async () => {
      const { result } = renderHook(
        () => useAnalytics({ scope: PageScope.ORGANIZATION }),
        { wrapper: createQueryWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.isRefreshing).toBe(false);
    });

    it('returns scope information', async () => {
      const { result } = renderHook(
        () => useAnalytics({ scope: PageScope.ORGANIZATION }),
        { wrapper: createQueryWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.scope).toBe(PageScope.ORGANIZATION);
      expect(result.current.scopeId).toBe('org-123');
    });
  });

  describe('Scope Selection', () => {
    it('uses organizationId for ORGANIZATION scope', async () => {
      const { result } = renderHook(
        () => useAnalytics({ scope: PageScope.ORGANIZATION }),
        { wrapper: createQueryWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.scopeId).toBe('org-123');
    });

    it('uses brandId for BRAND scope', async () => {
      const { result } = renderHook(
        () => useAnalytics({ scope: PageScope.BRAND }),
        { wrapper: createQueryWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.scopeId).toBe('brand-123');
    });

    it('uses provided scopeId over default', async () => {
      const { result } = renderHook(
        () =>
          useAnalytics({
            scope: PageScope.ORGANIZATION,
            scopeId: 'custom-org-456',
          }),
        { wrapper: createQueryWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.scopeId).toBe('custom-org-456');
    });

    it('returns undefined scopeId for SUPERADMIN scope without provided scopeId', async () => {
      const { result } = renderHook(
        () => useAnalytics({ scope: PageScope.SUPERADMIN }),
        { wrapper: createQueryWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.scopeId).toBeUndefined();
    });
  });

  describe('Scope State Management', () => {
    it('initializes selectedScope to provided scope', async () => {
      const { result } = renderHook(
        () => useAnalytics({ scope: PageScope.BRAND }),
        { wrapper: createQueryWrapper() },
      );

      expect(result.current.selectedScope).toBe(PageScope.BRAND);
    });

    it('provides setSelectedScope function', () => {
      const { result } = renderHook(
        () => useAnalytics({ scope: PageScope.ORGANIZATION }),
        { wrapper: createQueryWrapper() },
      );

      expect(typeof result.current.setSelectedScope).toBe('function');
    });

    it('can update selectedScope', () => {
      const { result } = renderHook(
        () => useAnalytics({ scope: PageScope.ORGANIZATION }),
        { wrapper: createQueryWrapper() },
      );

      act(() => {
        result.current.setSelectedScope(PageScope.BRAND);
      });

      expect(result.current.selectedScope).toBe(PageScope.BRAND);
    });

    it('provides setSelectedScopeId function', () => {
      const { result } = renderHook(
        () => useAnalytics({ scope: PageScope.ORGANIZATION }),
        { wrapper: createQueryWrapper() },
      );

      expect(typeof result.current.setSelectedScopeId).toBe('function');
    });

    it('can update selectedScopeId', () => {
      const { result } = renderHook(
        () => useAnalytics({ scope: PageScope.ORGANIZATION }),
        { wrapper: createQueryWrapper() },
      );

      act(() => {
        result.current.setSelectedScopeId('new-scope-id');
      });

      expect(result.current.selectedScopeId).toBe('new-scope-id');
    });
  });

  describe('autoLoad Option', () => {
    it('defaults to autoLoad true', async () => {
      const { result } = renderHook(
        () => useAnalytics({ scope: PageScope.ORGANIZATION }),
        { wrapper: createQueryWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.analytics).toBeDefined();
    });

    it('accepts autoLoad false', async () => {
      const { result } = renderHook(
        () =>
          useAnalytics({
            autoLoad: false,
            scope: PageScope.ORGANIZATION,
          }),
        { wrapper: createQueryWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.analytics).toBeDefined();
    });
  });

  describe('Refresh Methods', () => {
    it('provides refresh method', () => {
      const { result } = renderHook(
        () => useAnalytics({ scope: PageScope.ORGANIZATION }),
        { wrapper: createQueryWrapper() },
      );

      expect(typeof result.current.refresh).toBe('function');
    });

    it('refresh triggers re-fetch', async () => {
      const { result } = renderHook(
        () => useAnalytics({ scope: PageScope.ORGANIZATION }),
        { wrapper: createQueryWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const callsBefore = mockFindOrganizationAnalytics.mock.calls.length;

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(mockFindOrganizationAnalytics.mock.calls.length).toBeGreaterThan(
          callsBefore,
        );
      });
    });
  });

  describe('Default Analytics Values', () => {
    it('has expected analytics properties', async () => {
      const { result } = renderHook(
        () => useAnalytics({ scope: PageScope.ORGANIZATION }),
        { wrapper: createQueryWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.analytics).toHaveProperty('totalPosts');
      expect(result.current.analytics).toHaveProperty('totalViews');
      expect(result.current.analytics).toHaveProperty(
        'totalCredentialsConnected',
      );
      expect(result.current.analytics).toHaveProperty('totalSubscriptions');
      expect(result.current.analytics).toHaveProperty('totalUsers');
      expect(result.current.analytics).toHaveProperty('totalBrands');
      expect(result.current.analytics).toHaveProperty('monthlyGrowth');
      expect(result.current.analytics).toHaveProperty('viewsGrowth');
    });
  });

  describe('All Return Values', () => {
    it('returns all expected properties', async () => {
      const { result } = renderHook(
        () => useAnalytics({ scope: PageScope.ORGANIZATION }),
        { wrapper: createQueryWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current).toHaveProperty('analytics');
      expect(result.current).toHaveProperty('isLoading');
      expect(result.current).toHaveProperty('isRefreshing');
      expect(result.current).toHaveProperty('scope');
      expect(result.current).toHaveProperty('scopeId');
      expect(result.current).toHaveProperty('selectedScope');
      expect(result.current).toHaveProperty('selectedScopeId');
      expect(result.current).toHaveProperty('setSelectedScope');
      expect(result.current).toHaveProperty('setSelectedScopeId');
      expect(result.current).toHaveProperty('refresh');
    });
  });
});
