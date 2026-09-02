import {
  type DashboardHydrationData,
  hydrateLayout,
  isResolvableSourceKey,
  sanitizeLayoutForPersistence,
} from '@genfeedai/agent/dashboard/dashboard-hydration';
import type { AgentUIBlock } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';

const persistableLayout: AgentUIBlock[] = [
  { id: 'posts', sourceKey: 'totalPosts', type: 'metric_card', value: 42 },
  { id: 'header', text: 'Overview', type: 'section_header' },
];

const collectionBlocks: AgentUIBlock[] = [
  {
    chartType: 'line',
    data: [{ date: 'd1', value: 5 }],
    id: 'trend',
    sourceKey: 'timeSeries',
    type: 'chart',
  },
  {
    columns: [{ key: 'name', label: 'Brand' }],
    id: 'brands',
    rows: [{ name: 'Acme' }],
    sourceKey: 'brandLeaderboard',
    type: 'table',
  },
  {
    id: 'top',
    posts: [{ id: 'seed', views: 1 }],
    sourceKey: 'topPosts',
    type: 'top_posts',
  },
];

const validLayout: AgentUIBlock[] = [
  persistableLayout[0],
  ...collectionBlocks,
  persistableLayout[1],
];

const bundle: DashboardHydrationData = {
  analytics: { totalPosts: 128 },
  brandLeaderboard: [{ name: 'Live Brand' }],
  timeSeriesData: [{ date: 'live', value: 99 }],
  topPosts: [{ id: 'live-post', title: 'Live', views: 500 }],
};

describe('dashboard hydration seam', () => {
  it('accepts known analytics sourceKeys per block type', () => {
    expect(isResolvableSourceKey('metric_card', 'totalPosts')).toBe(true);
    expect(isResolvableSourceKey('chart', 'timeSeries')).toBe(true);
    expect(isResolvableSourceKey('metric_card', undefined)).toBe(false);
    expect(isResolvableSourceKey('metric_card', 'not_a_metric')).toBe(false);
  });

  it('strips embedded snapshots but keeps sourceKey + presentational content', () => {
    const { document, issues } =
      sanitizeLayoutForPersistence(persistableLayout);

    expect(issues).toEqual([]);
    expect(document.version).toBe('genfeed.dashboard.openui.v1');

    const [metric, header] = document.blocks;
    expect(metric).toMatchObject({ sourceKey: 'totalPosts', value: '' });
    // presentational block persisted verbatim
    expect(header).toMatchObject({ text: 'Overview', type: 'section_header' });
  });

  it('rejects a data-bearing block that lacks a resolvable sourceKey', () => {
    const { issues } = sanitizeLayoutForPersistence([
      { id: 'orphan', type: 'metric_card', value: 7 },
    ]);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: 'invalid_props',
      path: 'blocks[0].sourceKey',
    });
  });

  it('accepts collection blocks and strips their embedded snapshots', () => {
    const { document, issues } = sanitizeLayoutForPersistence(collectionBlocks);

    expect(issues).toEqual([]);
    expect(document.blocks[0]).toMatchObject({
      data: [],
      sourceKey: 'timeSeries',
    });
    expect(document.blocks[1]).toMatchObject({
      rows: [],
      sourceKey: 'brandLeaderboard',
    });
    expect(document.blocks[2]).toMatchObject({
      posts: [],
      sourceKey: 'topPosts',
    });
  });

  it('surfaces parser issues for a structurally invalid document', () => {
    const { issues } = sanitizeLayoutForPersistence({ nonsense: true });
    expect(issues.length).toBeGreaterThan(0);
  });

  it('refills placeholders from the live bundle and marks blocks ready', () => {
    const { document } = sanitizeLayoutForPersistence(validLayout);
    const hydrated = hydrateLayout(document, bundle);

    const [metric, chart, table, top] = hydrated;
    expect(metric).toMatchObject({
      hydration: { status: 'ready' },
      value: 128,
    });
    expect(chart).toMatchObject({
      data: [{ date: 'live', value: 99 }],
      hydration: { status: 'ready' },
    });
    expect(table).toMatchObject({ rows: [{ name: 'Live Brand' }] });
    expect(top).toMatchObject({
      posts: [{ id: 'live-post', title: 'Live', views: 500 }],
    });
  });

  it('hydrates derived and fallback KPI sourceKeys from live analytics', () => {
    const blocks = hydrateLayout(
      {
        blocks: [
          {
            id: 'platforms',
            sourceKey: 'activePlatformsCount',
            type: 'metric_card',
            value: '',
          },
          {
            id: 'views-per-post',
            sourceKey: 'avgViewsPerPost',
            type: 'metric_card',
            value: '',
          },
          {
            id: 'engagement',
            sourceKey: 'totalEngagement',
            type: 'metric_card',
            value: '',
          },
        ],
        version: 'genfeed.dashboard.openui.v1',
      },
      {
        analytics: {
          activePlatforms: ['instagram', 'tiktok'],
          totalLikes: 4200,
          totalPosts: 5,
          totalViews: 1000,
        },
      },
    );

    expect(blocks[0]).toMatchObject({ value: 2 });
    expect(blocks[1]).toMatchObject({ value: '200' });
    expect(blocks[2]).toMatchObject({ value: '4.2K' });
  });

  it('rejects a known metric sourceKey when its live value is not provided', () => {
    const { document } = sanitizeLayoutForPersistence(validLayout);

    expect(() => hydrateLayout(document, { analytics: {} })).toThrow(
      /live data for sourceKey "totalPosts" was not provided/,
    );
  });

  it('rejects an unsupported persisted sourceKey explicitly', () => {
    expect(() =>
      hydrateLayout(
        {
          blocks: [
            {
              id: 'unknown-metric',
              sourceKey: 'not_a_metric',
              type: 'metric_card',
              value: '',
            },
          ],
          version: 'genfeed.dashboard.openui.v1',
        },
        bundle,
      ),
    ).toThrow(/unsupported sourceKey "not_a_metric"/);
  });

  it('rejects a recognized collection sourceKey when its live collection is not provided', () => {
    expect(() =>
      hydrateLayout(
        {
          blocks: [collectionBlocks[0]],
          version: 'genfeed.dashboard.openui.v1',
        },
        { analytics: { totalPosts: 128 } },
      ),
    ).toThrow(/live data for sourceKey "timeSeries" was not provided/);
  });
});
