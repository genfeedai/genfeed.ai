import { describe, expect, it } from 'vitest';
import {
  authorizeResearchFindingReferences,
  isAuthorizedAnalyticsQueryReference,
} from './agent-page-context-authorization.util';

const scope = {
  brandId: 'brand-1',
  organizationId: 'organization-1',
};

function analyticsReference() {
  return {
    brandId: 'brand-1',
    dateRange: { endDate: '2026-07-15', startDate: '2026-07-01' },
    filters: { metric: 'views', platform: 'instagram' },
    id: 'analytics-query-1234abcd',
    kind: 'analytics-query',
    metric: 'views',
    organizationId: 'organization-1',
    provenance: {
      authority: 'server-hydrated',
      source: 'genfeed-analytics-api',
      summaryAuthority: 'derivative',
    },
    route: '/analytics/posts',
    selectedResource: { id: 'post-1', kind: 'post' },
    version: 1,
  };
}

describe('agent page-context authorization', () => {
  it('accepts a finite Analytics query only in its authenticated scope', () => {
    expect(
      isAuthorizedAnalyticsQueryReference(analyticsReference(), scope),
    ).toBe(true);
    expect(
      isAuthorizedAnalyticsQueryReference(
        { ...analyticsReference(), organizationId: 'organization-forged' },
        scope,
      ),
    ).toBe(false);
    expect(
      isAuthorizedAnalyticsQueryReference(
        { ...analyticsReference(), brandId: 'brand-forged' },
        scope,
      ),
    ).toBe(false);
  });

  it('rejects malformed Analytics metadata before prompt serialization', () => {
    expect(
      isAuthorizedAnalyticsQueryReference(
        {
          ...analyticsReference(),
          filters: { metric: 'views', unexpected: 'copied-value' },
        },
        scope,
      ),
    ).toBe(false);
    expect(
      isAuthorizedAnalyticsQueryReference(
        { ...analyticsReference(), route: '/admin/overview/analytics/all' },
        scope,
      ),
    ).toBe(false);
  });

  it('authorizes and deduplicates scoped Research selectors without copied state', () => {
    expect(
      authorizeResearchFindingReferences(
        [
          {
            ...scope,
            copiedBody: 'must be stripped',
            id: 'trend-1',
            kind: 'research-trend-video',
          },
          {
            ...scope,
            id: 'trend-1',
            kind: 'research-trend-video',
          },
        ],
        scope,
      ),
    ).toEqual([
      {
        ...scope,
        id: 'trend-1',
        kind: 'research-trend-video',
      },
    ]);
  });

  it('rejects forged, malformed, and unbounded Research selectors', () => {
    expect(
      authorizeResearchFindingReferences(
        [
          {
            ...scope,
            brandId: 'brand-forged',
            id: 'trend-1',
            kind: 'research-trend-video',
          },
        ],
        scope,
      ),
    ).toBeNull();
    expect(
      authorizeResearchFindingReferences(
        [
          {
            ...scope,
            id: '../../admin',
            kind: 'research-trend-video',
          },
        ],
        scope,
      ),
    ).toBeNull();
    expect(
      authorizeResearchFindingReferences(
        Array.from({ length: 21 }, (_, index) => ({
          ...scope,
          id: `trend-${index}`,
          kind: 'research-trend-video',
        })),
        scope,
      ),
    ).toBeNull();
  });
});
