import { describe, expect, it } from 'vitest';
import {
  buildAnalyticsQueryReference,
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

  it('restores the Posts Winners view and drops unknown show values', () => {
    const winners = restoreAnalyticsSurfaceState({
      pathname: '/acme/moonrise/analytics/posts',
      searchParams: new URLSearchParams('show=winners'),
    });
    const unknown = restoreAnalyticsSurfaceState({
      pathname: '/acme/moonrise/analytics/posts',
      searchParams: new URLSearchParams('show=everything'),
    });
    const elsewhere = restoreAnalyticsSurfaceState({
      pathname: '/acme/moonrise/analytics/accounts',
      searchParams: new URLSearchParams('show=winners'),
    });

    expect(winners.filters.show).toBe('winners');
    expect(winners.canonicalSearchParams.get('show')).toBe('winners');
    expect(unknown.filters.show).toBeUndefined();
    expect(unknown.canonicalSearchParams.get('show')).toBeNull();
    expect(elsewhere.canonicalSearchParams.get('show')).toBeNull();
  });

  it('canonicalizes unsafe filters and invalid future date ranges', () => {
    const restored = restoreAnalyticsSurfaceState({
      pathname: '/acme/moonrise/analytics/outliers',
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

  it.each(['moonrise', '~'])(
    'restores brand detail within %s scope',
    (scope) => {
      const restored = restoreAnalyticsSurfaceState({
        pathname: `/acme/${scope}/analytics/brands/brand-2`,
        searchParams: new URLSearchParams(
          'startDate=2024-06-01&endDate=2024-06-30&q=moon&sort=views',
        ),
      });

      expect(restored.filters).toEqual({});
      expect(restored.canonicalSearchParams.get('q')).toBeNull();
      expect(restored.canonicalSearchParams.get('sort')).toBeNull();
      expect(restored.selectedResource).toEqual({
        id: 'brand-2',
        kind: 'brand',
      });
      expect(restored.routeBrandId).toBe('brand-2');
    },
  );

  it.each(['moonrise', '~'])(
    'resolves both the platform and the enclosing brand id on the platform sub-route within %s scope',
    (scope) => {
      const restored = restoreAnalyticsSurfaceState({
        pathname: `/acme/${scope}/analytics/brands/brand-2/platforms/instagram`,
        searchParams: new URLSearchParams(
          'startDate=2024-06-01&endDate=2024-06-30',
        ),
      });

      expect(restored.selectedResource).toEqual({
        id: 'instagram',
        kind: 'platform',
      });
      expect(restored.routeBrandId).toBe('brand-2');
    },
  );

  it('does not resolve a route brand id for the org-wide overview route', () => {
    const restored = restoreAnalyticsSurfaceState({
      pathname: '/acme/~/analytics/overview',
      searchParams: new URLSearchParams(
        'startDate=2024-06-01&endDate=2024-06-30',
      ),
    });

    expect(restored.routeBrandId).toBeUndefined();
    expect(restored.selectedResource).toBeUndefined();
  });

  it('does not resolve a route brand id for the brands list route', () => {
    const restored = restoreAnalyticsSurfaceState({
      pathname: '/acme/moonrise/analytics/brands',
      searchParams: new URLSearchParams(
        'startDate=2024-06-01&endDate=2024-06-30',
      ),
    });

    expect(restored.routeBrandId).toBeUndefined();
  });
});

describe('Canonical analytics metric restoration', () => {
  it.each([
    'comments',
    'engagement',
    'engagementRate',
    'likes',
    'posts',
    'saves',
    'shares',
    'views',
  ])('preserves %s for metric and sort URL filters', (metric) => {
    for (const [route, key] of [
      ['posts', 'metric'],
      ['brands', 'sort'],
    ]) {
      const restored = restoreAnalyticsSurfaceState({
        pathname: `/acme/moonrise/analytics/${route}`,
        searchParams: new URLSearchParams(`${key}=${metric}&thread=opaque`),
      });
      expect(restored.filters[key as 'metric' | 'sort']).toBe(metric);
      expect(restored.canonicalSearchParams.get(key)).toBe(metric);
      expect(restored.canonicalSearchParams.get('thread')).toBe('opaque');
    }
  });
  it.each(['__proto__', 'constructor', 'toString', 'followers', 'Views'])(
    'rejects unsupported %s URL metrics',
    (metric) => {
      const restored = restoreAnalyticsSurfaceState({
        pathname: '/acme/moonrise/analytics/posts',
        searchParams: new URLSearchParams(`metric=${metric}`),
      });
      expect(restored.filters.metric).toBe('views');
    },
  );
});
