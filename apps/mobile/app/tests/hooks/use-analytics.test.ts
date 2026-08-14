import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/contexts/auth-context', () => ({
  useMobileAuth: vi.fn(() => ({
    getToken: vi.fn().mockResolvedValue('test-token'),
    isLoaded: true,
    isSignedIn: true,
    refreshSession: vi.fn(),
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
    user: null,
  })),
}));

vi.mock('@/services/api/analytics.service', () => ({
  analyticsService: {
    getEngagement: vi.fn(),
    getOverview: vi.fn(),
    getPlatformStats: vi.fn(),
    getTopContent: vi.fn(),
  },
}));

import { useMobileAuth } from '@/contexts/auth-context';
import { useAnalytics, useTopContent } from '@/hooks/use-analytics';
import { analyticsService } from '@/services/api/analytics.service';

describe('useAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMobileAuth).mockReturnValue({
      getToken: vi.fn().mockResolvedValue('test-token'),
      isLoaded: true,
      isSignedIn: true,
      refreshSession: vi.fn(),
      signInWithEmail: vi.fn(),
      signOut: vi.fn(),
      user: null,
    } as unknown as ReturnType<typeof useMobileAuth>);
  });

  it('loads overview, top content, platforms, and engagement in parallel', async () => {
    vi.mocked(analyticsService.getOverview).mockResolvedValue({
      data: {
        attributes: { totalPosts: 3, totalViews: 100 },
        id: 'overview',
        type: 'analytics-overview',
      },
    } as never);
    vi.mocked(analyticsService.getTopContent).mockResolvedValue({
      data: [
        {
          attributes: { id: 'post-1', title: 'Launch' },
          id: 'post-1',
          type: 'top-content',
        },
      ],
    } as never);
    vi.mocked(analyticsService.getPlatformStats).mockResolvedValue({
      data: [
        {
          attributes: { platform: 'x', totalPosts: 2 },
          id: 'x',
          type: 'platform-stats',
        },
      ],
    } as never);
    vi.mocked(analyticsService.getEngagement).mockResolvedValue({
      data: {
        attributes: { totalEngagement: 12 },
        id: 'engagement',
        type: 'engagement',
      },
    } as never);

    const { result } = renderHook(() =>
      useAnalytics({ brand: 'acme', startDate: '2026-08-01' }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data.overview).toEqual({
      totalPosts: 3,
      totalViews: 100,
    });
    expect(result.current.data.topContent).toEqual([
      { id: 'post-1', title: 'Launch' },
    ]);
    expect(result.current.data.platformStats).toEqual([
      { platform: 'x', totalPosts: 2 },
    ]);
    expect(result.current.data.engagement).toEqual({ totalEngagement: 12 });
    expect(analyticsService.getTopContent).toHaveBeenCalledWith('test-token', {
      brand: 'acme',
      limit: 5,
      startDate: '2026-08-01',
    });
  });

  it('surfaces a missing-token error without calling analytics', async () => {
    vi.mocked(useMobileAuth).mockReturnValue({
      getToken: vi.fn().mockResolvedValue(null),
      isLoaded: true,
      isSignedIn: false,
      refreshSession: vi.fn(),
      signInWithEmail: vi.fn(),
      signOut: vi.fn(),
      user: null,
    } as unknown as ReturnType<typeof useMobileAuth>);

    const { result } = renderHook(() => useAnalytics());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error?.message).toBe('Not authenticated');
    expect(analyticsService.getOverview).not.toHaveBeenCalled();
  });
});

describe('useTopContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMobileAuth).mockReturnValue({
      getToken: vi.fn().mockResolvedValue('test-token'),
      isLoaded: true,
      isSignedIn: true,
      refreshSession: vi.fn(),
      signInWithEmail: vi.fn(),
      signOut: vi.fn(),
      user: null,
    } as unknown as ReturnType<typeof useMobileAuth>);
  });

  it('unwraps top-content attributes', async () => {
    vi.mocked(analyticsService.getTopContent).mockResolvedValue({
      data: [
        {
          attributes: { id: 'post-1', title: 'Launch' },
          id: 'post-1',
          type: 'top-content',
        },
      ],
    } as never);

    const { result } = renderHook(() => useTopContent({ limit: 3 }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.topContent).toEqual([
      { id: 'post-1', title: 'Launch' },
    ]);
  });
});
