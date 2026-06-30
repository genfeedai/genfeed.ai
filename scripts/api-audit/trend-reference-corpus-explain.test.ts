import { describe, expect, it } from 'vitest';
import {
  buildTrendReferenceCorpusExplainQueries,
  formatTrendReferenceCorpusExplainRun,
  summarizeTrendReferenceCorpusExplainJson,
} from './trend-reference-corpus-explain';

describe('trend reference corpus explain harness', () => {
  it('keeps one explain query per reviewed trend corpus lookup path', () => {
    const queries = buildTrendReferenceCorpusExplainQueries();

    expect(queries.map((query) => query.name)).toEqual([
      'trendReferenceCorpus.sourceUrlResolution',
      'trendReferenceCorpus.trendLinks',
      'trendReferenceCorpus.globalRank',
      'trendReferenceCorpus.platformRank',
      'trendReferenceCorpus.accountRank',
      'trendReferenceCorpus.topAccounts',
      'trendReferenceCorpus.remixCountsForPage',
      'trendReferenceCorpus.brandRemixCountsByAccount',
    ]);
    expect(queries.every((query) => query.sql.includes('$'))).toBe(true);
    expect(
      queries.every((query) =>
        query.source.includes(
          'apps/server/api/src/collections/trends/services/trend-reference-corpus.service.ts',
        ),
      ),
    ).toBe(true);
  });

  it('documents the index contract for #629 ranking and remix-count paths', () => {
    const expectedIndexes = new Set(
      buildTrendReferenceCorpusExplainQueries().flatMap(
        (query) => query.expectedIndexes,
      ),
    );

    expect(expectedIndexes).toEqual(
      new Set([
        '_remix_lineage_source_refs_AB_pkey',
        '_remix_lineage_source_refs_B_index',
        'trend_remix_lineages_org_brand_deleted_idx',
        'trend_source_reference_links_trend_deleted_idx',
        'trend_source_refs_account_lookup_idx',
        'trend_source_refs_account_rank_idx',
        'trend_source_refs_platform_rank_idx',
        'trend_source_refs_rank_idx',
        'trend_source_refs_url_platform_deleted_idx',
      ]),
    );
  });

  it('summarizes FORMAT JSON plans and records expected-index matches', () => {
    const query = buildTrendReferenceCorpusExplainQueries().find(
      (candidate) => candidate.name === 'trendReferenceCorpus.platformRank',
    );

    if (!query) {
      throw new Error('Missing platform rank EXPLAIN query');
    }

    const summary = summarizeTrendReferenceCorpusExplainJson(query, 'current', [
      {
        'QUERY PLAN': [
          {
            'Execution Time': 2.25,
            Plan: {
              'Actual Rows': 30,
              'Node Type': 'Limit',
              'Plan Rows': 30,
              Plans: [
                {
                  'Index Name': 'trend_source_refs_platform_rank_idx',
                  'Node Type': 'Index Scan',
                },
              ],
              'Total Cost': 42.5,
            },
            'Planning Time': 0.5,
          },
        ],
      },
    ]);

    expect(summary).toMatchObject({
      expectedIndexMatched: true,
      expectedIndexes: ['trend_source_refs_platform_rank_idx'],
      indexesUsed: ['trend_source_refs_platform_rank_idx'],
      name: 'trendReferenceCorpus.platformRank',
      seqScanCount: 0,
    });
  });

  it('formats concise markdown evidence for pull request review', () => {
    const query = buildTrendReferenceCorpusExplainQueries()[0];
    const summary = summarizeTrendReferenceCorpusExplainJson(query, 'current', [
      {
        'QUERY PLAN': [
          {
            'Execution Time': 1,
            Plan: {
              'Actual Rows': 1,
              'Index Name': 'trend_source_refs_url_platform_deleted_idx',
              'Node Type': 'Index Scan',
              'Plan Rows': 1,
              'Total Cost': 10,
            },
            'Planning Time': 0.25,
          },
        ],
      },
    ]);

    const markdown = formatTrendReferenceCorpusExplainRun({
      fixtureRows: 50_000,
      generatedAt: '2026-06-30T00:00:00.000Z',
      queries: [summary],
    });

    expect(markdown).toContain('# Trend Reference Corpus EXPLAIN Smoke');
    expect(markdown).toContain('Fixture rows: 50000');
    expect(markdown).toContain('trendReferenceCorpus.sourceUrlResolution');
    expect(markdown).toContain('trend_source_refs_url_platform_deleted_idx');
    expect(markdown).toContain('yes');
  });
});
