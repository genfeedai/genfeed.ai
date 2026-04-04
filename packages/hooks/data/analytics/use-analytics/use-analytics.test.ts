import { useAnalytics } from '@hooks/data/analytics/use-analytics/use-analytics';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Define PageScope type to match the actual enum
type PageScopeType = 'superadmin' | 'organization' | 'brand';

// Mock PageScope constant
const PageScope: Record<string, PageScopeType> = {
  BRAND: 'brand',
  ORGANIZATION: 'organization',
  SUPERADMIN: 'superadmin',
};

vi.mock('@ui-constants/misc.constant', () => ({
  PageScope: {
    BRAND: 'brand',
    ORGANIZATION: 'organization',
    SUPERADMIN: 'superadmin',
  },
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    brandId: 'brand-123',
    organizationId: 'org-123',
  })),
}));

const mockRefresh = vi.fn();

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() =>
    vi.fn().mockResolvedValue({
      findAll: vi.fn().mockResolvedValue({ totalPosts: 100 }),
      findBrandAnalytics: vi.fn().mockResolvedValue({ totalPosts: 25 }),
      findOrganizationAnalytics: vi.fn().mockResolvedValue({ totalPosts: 50 }),
    }),
  ),
}));

vi.mock('@hooks/data/resource/use-resource/use-resource', () => ({
  useResource: vi.fn((_fetcher, _options) => ({
    data: {
      monthlyGrowth: 15,
      totalBrands: 2,
      totalCredentialsConnected: 5,
      totalPosts: 100,
      totalSubscriptions: 3,
      totalUsers: 10,
      totalViews: 5000,
      viewsGrowth: 25,
    },
    isLoading: false,
    isRefreshing: false,
    refresh: mockRefresh,
  })),
}));

describe('useAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRefresh.mockResolvedValue(undefined);
  });

  describe('Initial State', () => {
    it('returns analytics data', () => {
      const { result } = renderHook(() =>
        useAnalytics({ scope: PageScope.ORGANIZATION }),
      );

      expect(result.current.analytics).toBeDefined();
      expect(result.current.analytics.totalPosts).toBe(100);
      expect(result.current.analytics.totalViews).toBe(5000);
    });

    it('returns loading states', () => {
      const { result } = renderHook(() =>
        useAnalytics({ scope: PageScope.ORGANIZATION }),
      );

      expect(result.current.isLoading).toBe(false);
      expect(result.current.isRefreshing).toBe(false);
    });

    it('returns scope information', () => {
      const { result } = renderHook(() =>
        useAnalytics({ scope: PageScope.ORGANIZATION }),
      );

      expect(result.current.scope).toBe(PageScope.ORGANIZATION);
      expect(result.current.scopeId).toBe('org-123');
    });
  });

  describe('Scope Selection', () => {
    it('uses organizationId for ORGANIZATION scope', () => {
      const { result } = renderHook(() =>
        useAnalytics({ scope: PageScope.ORGANIZATION }),
      );

      expect(result.current.scopeId).toBe('org-123');
    });

    it('uses brandId for BRAND scope', () => {
      const { result } = renderHook(() =>
        useAnalytics({ scope: PageScope.BRAND }),
      );

      expect(result.current.scopeId).toBe('brand-123');
    });

    it('uses provided scopeId over default', () => {
      const { result } = renderHook(() =>
        useAnalytics({
          scope: PageScope.ORGANIZATION,
          scopeId: 'custom-org-456',
        }),
      );

      expect(result.current.scopeId).toBe('custom-org-456');
    });

    it('returns undefined scopeId for SUPERADMIN scope without provided scopeId', () => {
      const { result } = renderHook(() =>
        useAnalytics({ scope: PageScope.SUPERADMIN }),
      );

      expect(result.current.scopeId).toBeUndefined();
    });
  });

  describe('Scope State Management', () => {
    it('initializes selectedScope to provided scope', () => {
      const { result } = renderHook(() =>
        useAnalytics({ scope: PageScope.BRAND }),
      );

      expect(result.current.selectedScope).toBe(PageScope.BRAND);
    });

    it('provides setSelectedScope function', () => {
      const { result } = renderHook(() =>
        useAnalytics({ scope: PageScope.ORGANIZATION }),
      );

      expect(typeof result.current.setSelectedScope).toBe('function');
    });

    it('can update selectedScope', () => {
      const { result } = renderHook(() =>
        useAnalytics({ scope: PageScope.ORGANIZATION }),
      );

      act(() => {
        result.current.setSelectedScope(PageScope.BRAND);
      });

      expect(result.current.selectedScope).toBe(PageScope.BRAND);
    });

    it('provides setSelectedScopeId function', () => {
      const { result } = renderHook(() =>
        useAnalytics({ scope: PageScope.ORGANIZATION }),
      );

      expect(typeof result.current.setSelectedScopeId).toBe('function');
    });

    it('can update selectedScopeId', () => {
      const { result } = renderHook(() =>
        useAnalytics({ scope: PageScope.ORGANIZATION }),
      );

      act(() => {
        result.current.setSelectedScopeId('new-scope-id');
      });

      expect(result.current.selectedScopeId).toBe('new-scope-id');
    });
  });

  describe('autoLoad Option', () => {
    it('defaults to autoLoad true', () => {
      const { result } = renderHook(() =>
        useAnalytics({ scope: PageScope.ORGANIZATION }),
      );

      // If autoLoad was false, analytics would be default empty values
      expect(result.current.analytics).toBeDefined();
    });

    it('accepts autoLoad false', () => {
      const { result } = renderHook(() =>
        useAnalytics({
          autoLoad: false,
          scope: PageScope.ORGANIZATION,
        }),
      );

      expect(result.current.analytics).toBeDefined();
    });
  });

  describe('Refresh Methods', () => {
    it('provides refresh method', () => {
      const { result } = renderHook(() =>
        useAnalytics({ scope: PageScope.ORGANIZATION }),
      );

      expect(typeof result.current.refresh).toBe('function');
    });

    it('refresh calls refresh handler', async () => {
      const { result } = renderHook(() =>
        useAnalytics({ scope: PageScope.ORGANIZATION }),
      );

      await act(async () => {
        await result.current.refresh();
      });

      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  describe('Default Analytics Values', () => {
    it('has expected analytics properties', () => {
      const { result } = renderHook(() =>
        useAnalytics({ scope: PageScope.ORGANIZATION }),
      );

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
    it('returns all expected properties', () => {
      const { result } = renderHook(() =>
        useAnalytics({ scope: PageScope.ORGANIZATION }),
      );

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
