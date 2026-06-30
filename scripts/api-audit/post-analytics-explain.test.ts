import { describe, expect, it } from 'vitest';
import {
  buildPostAnalyticsExplainQueries,
  redactBindSignature,
  summarizeExplainJson,
} from './post-analytics-explain';

describe('post analytics explain harness', () => {
  it('keeps one explain query per reviewed raw SQL path', () => {
    const queries = buildPostAnalyticsExplainQueries();

    expect(queries.map((query) => query.name)).toEqual([
      'analytics.timeSeries.org',
      'analytics.overview.current',
      'analytics.overview.previous',
      'analytics.bestPostingTimes',
      'analytics.topContent.engagement',
      'analytics.platformComparison.brand',
      'analytics.growth.current',
      'analytics.growth.previous',
      'analytics.engagementBreakdown',
      'analytics.viralHooks.videos',
      'analytics.viralHooks.platforms',
      'entityLeaderboard.current.org',
      'entityLeaderboard.previous.brand',
      'posts.findRootPost.ancestors',
    ]);

    expect(queries.every((query) => query.sql.includes('$'))).toBe(true);
    expect(
      queries
        .filter((query) => query.name !== 'posts.findRootPost.ancestors')
        .every((query) => query.sql.includes('"post_analytics"')),
    ).toBe(true);
  });

  it('redacts bind values while preserving useful shapes', () => {
    const signature = redactBindSignature([
      new Date('2026-01-01T00:00:00.000Z'),
      'org-secret-value',
      50,
      ['brand-a', 'brand-b'],
    ]);

    expect(signature).toEqual([
      'date',
      'string(16)',
      'number(2)',
      'array<string>[2]',
    ]);
    expect(signature.join(' ')).not.toContain('org-secret-value');
  });

  it('summarizes FORMAT JSON plans with index usage and scan counts', () => {
    const [query] = buildPostAnalyticsExplainQueries();
    const summary = summarizeExplainJson(query, 'after-indexes', [
      {
        'QUERY PLAN': [
          {
            'Execution Time': 1.5,
            Plan: {
              'Actual Rows': 10,
              'Node Type': 'Aggregate',
              'Plan Rows': 12,
              Plans: [
                {
                  'Index Name': 'post_analytics_organizationId_date_idx',
                  'Node Type': 'Index Scan',
                },
                {
                  'Node Type': 'Seq Scan',
                },
              ],
              'Total Cost': 123.45,
            },
            'Planning Time': 0.2,
          },
        ],
      },
    ]);

    expect(summary).toMatchObject({
      actualRows: 10,
      executionMs: 1.5,
      indexesUsed: ['post_analytics_organizationId_date_idx'],
      name: query.name,
      planningMs: 0.2,
      planRows: 12,
      seqScanCount: 1,
      totalCost: 123.45,
    });
  });
});
