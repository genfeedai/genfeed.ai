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

vi.mock('@/services/api/request-scope', () => ({
  loadRequestScope: vi.fn(async () => ({
    brandId: 'brand-1',
    organizationId: 'org-1',
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
import { loadRequestScope } from '@/services/api/request-scope';

const scope = { brandId: 'brand-1', organizationId: 'org-1' };

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
        attributes: {
          avgEngagementRate: 1.5,
          growth: { engagement: -1, posts: 0, views: 4 },
          totalEngagement: 12,
          totalPosts: 3,
          totalViews: 100,
        },
        id: 'overview',
        type: 'analytics-overview',
      },
    } as never);
    vi.mocked(analyticsService.getTopContent).mockResolvedValue({
      data: [
        {
          attributes: {
            label: 'Launch',
            platform: 'x',
            postId: 'post-1',
            totalViews: 10,
          },
          id: 'post-1',
          type: 'analytics-top-post',
        },
      ],
    } as never);
    vi.mocked(analyticsService.getPlatformStats).mockResolvedValue({
      data: [
        {
          attributes: {
            engagementRate: 3.5,
            platform: 'x',
            postCount: 2,
            views: 40,
          },
          id: 'x',
          type: 'platform-comparison',
        },
      ],
    } as never);
    vi.mocked(analyticsService.getEngagement).mockResolvedValue({
      data: {
        attributes: {
          comments: 2,
          likes: 8,
          percentages: { comments: 16, likes: 66, saves: 8, shares: 8 },
          saves: 1,
          shares: 1,
        },
        id: 'engagement',
        type: 'analytics-engagement',
      },
    } as never);

    const options = { startDate: '2026-08-01' };
    const { result } = renderHook(() => useAnalytics(options));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data.overview).toEqual({
      avgEngagementRate: 1.5,
      engagementGrowth: -1,
      totalEngagement: 12,
      totalPosts: 3,
      totalViews: 100,
      viewsGrowth: 4,
    });
    expect(result.current.data.topContent).toEqual([
      {
        label: 'Launch',
        platform: 'x',
        postId: 'post-1',
        totalViews: 10,
      },
    ]);
    expect(result.current.data.platformStats).toEqual([
      { engagementRate: 3.5, platform: 'x', postCount: 2, views: 40 },
    ]);
    expect(result.current.data.engagement).toEqual({
      comments: 2,
      commentsPercentage: 16,
      likes: 8,
      likesPercentage: 66,
      saves: 1,
      savesPercentage: 8,
      shares: 1,
      sharesPercentage: 8,
    });
    expect(analyticsService.getTopContent).toHaveBeenCalledWith(
      'test-token',
      scope,
      { ...options, limit: 5 },
    );
    expect(analyticsService.getOverview).toHaveBeenCalledWith(
      'test-token',
      scope,
      options,
    );
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
    expect(loadRequestScope).not.toHaveBeenCalled();
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

  it('reads live top-post attributes', async () => {
    vi.mocked(analyticsService.getTopContent).mockResolvedValue({
      data: [
        {
          attributes: {
            label: 'Launch',
            platform: 'x',
            postId: 'post-1',
            totalViews: 10,
          },
          id: 'post-1',
          type: 'analytics-top-post',
        },
      ],
    } as never);

    const { result } = renderHook(() => useTopContent({ limit: 3 }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.topContent).toEqual([
      {
        label: 'Launch',
        platform: 'x',
        postId: 'post-1',
        totalViews: 10,
      },
    ]);
    expect(analyticsService.getTopContent).toHaveBeenCalledWith(
      'test-token',
      scope,
      { limit: 3 },
    );
  });
});
