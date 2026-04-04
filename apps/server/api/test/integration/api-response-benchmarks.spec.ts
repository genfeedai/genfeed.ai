import { describe, expect, it } from 'vitest';
import {
  buildMarkdownReport,
  calculateLatencySummary,
  detectRegressions,
} from '../../scripts/check-api-response-benchmarks';

describe('api-response-benchmarks', () => {
  it('calculates latency percentiles from measured samples', () => {
    const summary = calculateLatencySummary([10, 20, 30, 40, 50], 5, 2);

    expect(summary.iterations).toBe(5);
    expect(summary.warmup).toBe(2);
    expect(summary.minMs).toBe(10);
    expect(summary.maxMs).toBe(50);
    expect(summary.meanMs).toBe(30);
    expect(summary.p50Ms).toBe(30);
    expect(summary.p95Ms).toBe(48);
  });

  it('flags regressions when p50 or p95 exceed the threshold', () => {
    const { regressions } = detectRegressions(
      [
        {
          id: 'organization-posts-list',
          label: 'Organization Posts List',
          method: 'GET',
          route: '/v1/organizations/org-id/posts?page=1&limit=25',
          summary: {
            iterations: 25,
            maxMs: 40,
            meanMs: 25,
            minMs: 20,
            p50Ms: 24,
            p95Ms: 39,
            warmup: 5,
          },
        },
      ],
      {
        endpoints: {
          'organization-posts-list': {
            iterations: 25,
            label: 'Organization Posts List',
            method: 'GET',
            p50Ms: 18,
            p95Ms: 30,
            route: '/v1/organizations/org-id/posts?page=1&limit=25',
            warmup: 5,
          },
        },
        generatedAt: '2026-04-02T00:00:00.000Z',
        regressionThresholdPct: 20,
      },
      20,
    );

    expect(regressions).toHaveLength(2);
    expect(regressions[0]?.metric).toBe('p50Ms');
    expect(regressions[1]?.metric).toBe('p95Ms');
  });

  it('reports missing baseline endpoints without creating regressions', () => {
    const result = detectRegressions(
      [
        {
          id: 'organization-brands-list',
          label: 'Organization Brands List',
          method: 'GET',
          route: '/v1/organizations/org-id/brands?page=1&limit=25',
          summary: {
            iterations: 25,
            maxMs: 12,
            meanMs: 8,
            minMs: 6,
            p50Ms: 8,
            p95Ms: 11,
            warmup: 5,
          },
        },
      ],
      null,
      20,
    );

    expect(result.regressions).toHaveLength(0);
    expect(result.missingBaselineEndpointIds).toEqual([
      'organization-brands-list',
    ]);
  });

  it('renders regressions and baseline gaps into markdown', () => {
    const markdown = buildMarkdownReport({
      baselineGeneratedAt: '2026-04-02T00:00:00.000Z',
      endpoints: [
        {
          id: 'organization-brands-list',
          label: 'Organization Brands List',
          method: 'GET',
          route: '/v1/organizations/org-id/brands?page=1&limit=25',
          summary: {
            iterations: 25,
            maxMs: 22,
            meanMs: 15,
            minMs: 10,
            p50Ms: 14,
            p95Ms: 21,
            warmup: 5,
          },
        },
      ],
      generatedAt: '2026-04-02T01:00:00.000Z',
      missingBaselineEndpointIds: ['organization-brands-list'],
      regressions: [
        {
          baselineMs: 10,
          currentMs: 14,
          deltaPct: 40,
          endpointId: 'organization-brands-list',
          label: 'Organization Brands List',
          metric: 'p50Ms',
          route: '/v1/organizations/org-id/brands?page=1&limit=25',
        },
      ],
      regressionThresholdPct: 20,
    });

    expect(markdown).toContain('# API Response Benchmarks');
    expect(markdown).toContain('## Regressions');
    expect(markdown).toContain('## Missing Baseline Entries');
    expect(markdown).toContain('Organization Brands List');
  });
});
