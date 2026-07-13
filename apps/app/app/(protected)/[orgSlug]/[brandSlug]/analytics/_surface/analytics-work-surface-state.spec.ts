import { describe, expect, it } from 'vitest';
import {
  buildAnalyticsQueryReference,
  buildCanonicalAnalyticsHref,
  restoreAnalyticsSurfaceState,
} from './analytics-work-surface-state';

describe('Analytics work surface state', () => {
  it('hydrates missing defaults while preserving opaque shell state', () => {
    const restored = restoreAnalyticsSurfaceState({
      pathname: '/acme/moonrise/analytics/posts',
      searchParams: new URLSearchParams('thread=thread-1&q=launch%20week'),
    });

    expect(restored.filters).toEqual({
      metric: 'views',
      query: 'launch week',
    });
    expect(restored.canonicalSearchParams.get('thread')).toBe('thread-1');
    expect(restored.canonicalSearchParams.get('startDate')).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
    expect(restored.canonicalSearchParams.get('endDate')).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
    expect(restored.isCanonical).toBe(false);
  });

  it('restores valid dates, filters, and selected resource references', () => {
    const restored = restoreAnalyticsSurfaceState({
      pathname: '/acme/moonrise/analytics/posts',
      searchParams: new URLSearchParams(
        'startDate=2024-06-01&endDate=2024-06-30&metric=likes&platform=instagram&postId=post-1',
      ),
    });

    expect(restored.dateRangeKeys).toEqual({
      endDate: '2024-06-30',
      startDate: '2024-06-01',
    });
    expect(restored.filters).toMatchObject({
      metric: 'likes',
      platform: 'instagram',
      postId: 'post-1',
    });
    expect(restored.selectedResource).toEqual({ id: 'post-1', kind: 'post' });
    expect(restored.isCanonical).toBe(true);
  });

  it('canonicalizes unsafe filters and invalid future date ranges', () => {
    const restored = restoreAnalyticsSurfaceState({
      pathname: '/acme/moonrise/analytics/trends',
      searchParams: new URLSearchParams(
        'startDate=2999-01-01&endDate=2999-01-02&platform=%00invalid&timeframe=forever',
      ),
    });

    expect(restored.canonicalSearchParams.get('platform')).toBeNull();
    expect(restored.canonicalSearchParams.get('timeframe')).toBe('72h');
    expect(restored.canonicalSearchParams.get('startDate')).not.toBe(
      '2999-01-01',
    );
    expect(restored.isCanonical).toBe(false);
  });

  it('publishes metadata-only typed query references with explicit provenance', () => {
    const restored = restoreAnalyticsSurfaceState({
      pathname: '/acme/moonrise/analytics/posts',
      searchParams: new URLSearchParams(
        'startDate=2024-06-01&endDate=2024-06-30&metric=views',
      ),
    });
    const reference = buildAnalyticsQueryReference({
      brandId: 'brand-1',
      dateRange: restored.dateRangeKeys,
      descriptor: restored.descriptor,
      filters: restored.filters,
      normalizedRoute: restored.normalizedRoute,
      organizationId: 'org-1',
    });

    expect(reference).toMatchObject({
      brandId: 'brand-1',
      kind: 'analytics-query',
      metric: 'views',
      organizationId: 'org-1',
      provenance: {
        authority: 'server-hydrated',
        source: 'genfeed-analytics-api',
        summaryAuthority: 'derivative',
      },
      route: '/analytics/posts',
      version: 1,
    });
    expect(reference).not.toHaveProperty('values');
  });

  it('builds a canonical escape hatch without shell-only references', () => {
    const href = buildCanonicalAnalyticsHref(
      '/acme/moonrise/analytics/posts',
      new URLSearchParams(
        'startDate=2024-06-01&endDate=2024-06-30&metric=views&thread=t-1&overlay=inspector&overlayRef=post-1',
      ),
    );

    expect(href).toContain('metric=views');
    expect(href).not.toContain('thread=');
    expect(href).not.toContain('overlay=');
    expect(href).not.toContain('overlayRef=');
  });

  it('drops list-only filters when restoring a detail explorer', () => {
    const restored = restoreAnalyticsSurfaceState({
      pathname: '/acme/moonrise/analytics/brands/brand-2',
      searchParams: new URLSearchParams(
        'startDate=2024-06-01&endDate=2024-06-30&q=moon&sort=views',
      ),
    });

    expect(restored.filters).toEqual({});
    expect(restored.canonicalSearchParams.get('q')).toBeNull();
    expect(restored.canonicalSearchParams.get('sort')).toBeNull();
    expect(restored.selectedResource).toEqual({ id: 'brand-2', kind: 'brand' });
  });
});
