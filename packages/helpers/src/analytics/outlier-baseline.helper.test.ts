import type {
  OutlierBaselineInput,
  OutlierBaselineOptions,
  OutlierBaselinePostInput,
  OutlierBaselineScope,
} from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import { computeOutlierBaseline } from './outlier-baseline.helper';

const NOW = Date.UTC(2026, 8, 14);
const DAY = 24 * 60 * 60 * 1000;
const SCOPE: OutlierBaselineScope = {
  accountId: 'account-a',
  contentType: 'short_video',
  organizationId: 'org-a',
  platform: 'instagram',
};

function post(
  id: string,
  overrides: Partial<OutlierBaselinePostInput> = {},
): OutlierBaselinePostInput {
  return {
    ...SCOPE,
    id,
    isDeleted: false,
    isPinned: false,
    isPromoted: false,
    publishedAtMs: NOW - 3 * DAY,
    views: 30_000,
    ...overrides,
  };
}

function history(count = 20, views = 30_000): OutlierBaselinePostInput[] {
  return Array.from({ length: count }, (_, i) =>
    post(`post-${String(i).padStart(3, '0')}`, {
      publishedAtMs: NOW - (i + 3) * DAY,
      views,
    }),
  );
}

function calculate(
  posts: OutlierBaselineInput['posts'],
  options?: Partial<OutlierBaselineOptions>,
) {
  return computeOutlierBaseline({ nowMs: NOW, options, posts, scope: SCOPE });
}

describe('computeOutlierBaseline', () => {
  it('excludes a pinned hit from the baseline while calculating its ratio', () => {
    const result = calculate([
      ...history(),
      post('pinned', { isPinned: true, views: 2_000_000 }),
    ]);

    expect(result).toMatchObject({
      computedAt: '2026-09-14T00:00:00.000Z',
      median: 30_000,
      options: {
        breakoutThreshold: 10,
        maturityMs: 2 * DAY,
        minimumSampleSize: 5,
        outlierThreshold: 3,
        windowSize: 20,
      },
      sampleSize: 20,
      scope: SCOPE,
      status: 'ready',
    });
    expect(result.contributorIds).not.toContain('pinned');
    expect(result.posts.at(-1)).toMatchObject({
      id: 'pinned',
      isContributor: false,
      ratio: 2_000_000 / 30_000,
      reasons: ['pinned'],
      tier: 'breakout',
    });
  });

  it.each([
    [300_000, 30_000, 10, 'breakout'],
    [90_000, 30_000, 3, 'outlier'],
    [89_999, 30_000, 89_999 / 30_000, null],
    [2_000_000, 4_000_000, 0.5, null],
  ])('classifies %s views on a %s baseline', (views, baseline, ratio, tier) => {
    const result = calculate([
      ...history(20, baseline),
      post('target', { views }),
    ]);
    expect(result.posts.at(-1)).toMatchObject({ ratio, tier });
  });

  it.each([0, 4])(
    'returns insufficient data for %s eligible posts',
    (count) => {
      const result = calculate(history(count));
      expect(result).toMatchObject({
        median: null,
        sampleSize: count,
        status: 'insufficient_data',
      });
      expect(
        result.posts.every((item) => item.ratio === null && item.tier === null),
      ).toBe(true);
    },
  );

  it.each([
    [[90, 10, 50, 20, 30], 30],
    [[90, 10, 50, 20, 30, 31], 30.5],
  ])('calculates the median of %j', (views, median) => {
    expect(
      calculate(views.map((value, i) => post(String(i), { views: value })))
        .median,
    ).toBe(median);
  });

  it('selects newest eligible posts and preserves earlier window results', () => {
    const posts = history(30).map((item, i) => ({
      ...item,
      views: i < 10 ? 10 : 100,
    }));
    const original = structuredClone(posts);
    const first = calculate(posts);
    const saved = structuredClone(first);
    const second = calculate([...posts].reverse(), { windowSize: 10 });
    expect(first.median).toBe(55);
    expect(second.median).toBe(10);
    expect(second.contributorIds).toEqual(
      posts.slice(0, 10).map((item) => item.id),
    );
    expect(second.posts[0]).toMatchObject({
      id: 'post-029',
      isContributor: false,
      ratio: 10,
      reasons: ['outside_window'],
      tier: 'breakout',
    });
    expect(first).toEqual(saved);
    expect(posts).toEqual(original);
  });

  it('uses code-point ID order to break timestamp ties independently of input order', () => {
    const posts = ['b', 'B', 'a', 'A', 'c', 'C'].map((id) => post(id));
    const forward = calculate(posts, { windowSize: 5 });
    const reversed = calculate([...posts].reverse(), { windowSize: 5 });
    expect(forward.contributorIds).toEqual(['A', 'B', 'C', 'a', 'b']);
    expect(reversed.contributorIds).toEqual(forward.contributorIds);
    expect(reversed.posts).toEqual([...forward.posts].reverse());
  });

  it('records each unknown provider flag without excluding the post', () => {
    const result = calculate([
      ...history(5),
      post('unknown-pin', { isPinned: null }),
      post('unknown-promotion', { isPromoted: null }),
    ]);
    expect(result.posts.at(-2)).toMatchObject({
      isContributor: true,
      isPinnedUnknown: true,
      isPromotedUnknown: false,
      reasons: [],
    });
    expect(result.posts.at(-1)).toMatchObject({
      isContributor: true,
      isPinnedUnknown: false,
      isPromotedUnknown: true,
      reasons: [],
    });
  });

  it.each([
    [{ isDeleted: true }, 'soft_deleted'],
    [{ isPromoted: true }, 'promoted'],
    [{ publishedAtMs: NOW - DAY }, 'immature'],
    [{ publishedAtMs: NOW + DAY }, 'immature'],
    ...[NaN, Infinity, 1.5, 8.64e15 + 1].map(
      (publishedAtMs) => [{ publishedAtMs }, 'invalid_publish_date'] as const,
    ),
    ...[null, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1].map(
      (views) => [{ views }, 'invalid_views'] as const,
    ),
  ] as const)('excludes invalid source data %j', (overrides, reason) => {
    const result = calculate([...history(5), post('excluded', overrides)]);
    expect(result.posts.at(-1)).toMatchObject({
      isContributor: false,
      ratio: null,
      reasons: [reason],
      tier: null,
    });
  });

  it('retains all exclusion reasons and never scores a pinned post with another defect', () => {
    const result = calculate([
      ...history(5),
      post('excluded', {
        isDeleted: true,
        isPinned: true,
        isPromoted: true,
        publishedAtMs: NOW,
        views: null,
      }),
      post('pinned-young', { isPinned: true, publishedAtMs: NOW }),
    ]);
    expect(result.posts.at(-2)?.reasons).toEqual([
      'soft_deleted',
      'pinned',
      'promoted',
      'immature',
      'invalid_views',
    ]);
    expect(result.posts.at(-2)?.ratio).toBeNull();
    expect(result.posts.at(-1)).toMatchObject({
      ratio: null,
      reasons: ['pinned', 'immature'],
    });
  });

  it('includes the exact maturity boundary and excludes one millisecond younger', () => {
    const result = calculate([
      ...history(5),
      post('boundary', { publishedAtMs: NOW - 2 * DAY }),
      post('young', { publishedAtMs: NOW - 2 * DAY + 1 }),
    ]);
    expect(result.posts.at(-2)?.isContributor).toBe(true);
    expect(result.posts.at(-1)?.reasons).toEqual(['immature']);
  });

  it('supports custom maturity, sample minimum and tier thresholds', () => {
    const posts = [
      ...history(5),
      post('target', { publishedAtMs: NOW, views: 150_000 }),
    ];
    expect(
      calculate(posts, {
        maturityMs: 0,
        minimumSampleSize: 6,
        outlierThreshold: 2,
        breakoutThreshold: 5,
      }).posts.at(-1)?.tier,
    ).toBe('breakout');
    expect(calculate(posts, { minimumSampleSize: 6 }).status).toBe(
      'insufficient_data',
    );
    expect(
      calculate([...history(5), post('target', { views: 60_000 })], {
        outlierThreshold: 2,
        breakoutThreshold: 5,
      }).posts.at(-1)?.tier,
    ).toBe('outlier');
  });

  it('never divides by a zero baseline, including a positive target', () => {
    const result = calculate([
      ...history(20, 0),
      post('target', { views: 300_000 }),
    ]);
    expect(result).toMatchObject({ median: 0, status: 'zero_baseline' });
    expect(
      result.posts.every((item) => item.ratio === null && item.tier === null),
    ).toBe(true);
  });

  it.each([
    { windowSize: 4 },
    { windowSize: 51 },
    { windowSize: 5.5 },
    { minimumSampleSize: 4 },
    { minimumSampleSize: 21 },
    { minimumSampleSize: 5.5 },
    { maturityMs: -1 },
    { maturityMs: Infinity },
    { maturityMs: 0.5 },
    { outlierThreshold: 0 },
    { outlierThreshold: NaN },
    { outlierThreshold: Infinity },
    { breakoutThreshold: 3 },
    { breakoutThreshold: 2 },
    { breakoutThreshold: NaN },
    { breakoutThreshold: Infinity },
  ])('rejects invalid configuration %j', (options) => {
    expect(() => calculate([], options)).toThrow(RangeError);
  });

  it.each([NaN, Infinity, 1.5, 8.64e15 + 1])(
    'rejects invalid computation time %s',
    (nowMs) => {
      expect(() =>
        computeOutlierBaseline({ nowMs, posts: [], scope: SCOPE }),
      ).toThrow(RangeError);
    },
  );

  it.each(['organizationId', 'accountId', 'platform', 'contentType'] as const)(
    'rejects empty or mixed %s scope',
    (field) => {
      expect(() =>
        computeOutlierBaseline({
          nowMs: NOW,
          posts: [],
          scope: { ...SCOPE, [field]: ' ' },
        }),
      ).toThrow(RangeError);
      expect(() => calculate([post('wrong', { [field]: 'other' })])).toThrow(
        RangeError,
      );
    },
  );

  it('rejects duplicate and empty post identifiers', () => {
    expect(() => calculate([post('same'), post('same')])).toThrow(RangeError);
    expect(() => calculate([post(' ')])).toThrow(RangeError);
  });

  it('copies scope, options and provenance instead of retaining caller references', () => {
    const scope = { ...SCOPE };
    const options = { windowSize: 5 };
    const posts = history(5).map((item) => Object.freeze(item));
    const result = computeOutlierBaseline({
      nowMs: NOW,
      options,
      posts: Object.freeze(posts),
      scope,
    });
    scope.accountId = 'changed';
    options.windowSize = 10;
    expect(result.scope).toEqual(SCOPE);
    expect(result.options.windowSize).toBe(5);
    expect(calculate(history(5)).posts).toEqual(result.posts);
  });

  it('selects exactly the newest fifty from a large unordered history', () => {
    const posts = history(10_000);
    const result = calculate([...posts].reverse(), { windowSize: 50 });
    expect(result.contributorIds).toEqual(
      posts.slice(0, 50).map((item) => item.id),
    );
    expect(result.sampleSize).toBe(50);
    expect(result.posts.filter((item) => item.isContributor)).toHaveLength(50);
  });
});
