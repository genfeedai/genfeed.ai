import {
  type DashboardHydrationData,
  hydrateLayout,
  isResolvableSourceKey,
  sanitizeLayoutForPersistence,
} from '@genfeedai/agent/dashboard/dashboard-hydration';
import type { AgentUIBlock } from '@genfeedai/interfaces';
import { describe, expect, it } from 'vitest';

const validLayout: AgentUIBlock[] = [
  { id: 'posts', sourceKey: 'totalPosts', type: 'metric_card', value: 42 },
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
  { id: 'header', text: 'Overview', type: 'section_header' },
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
    const { document, issues } = sanitizeLayoutForPersistence(validLayout);

    expect(issues).toEqual([]);
    expect(document.version).toBe('genfeed.dashboard.openui.v1');

    const [metric, chart, table, top, header] = document.blocks;
    expect(metric).toMatchObject({ sourceKey: 'totalPosts', value: '' });
    expect(chart).toMatchObject({ data: [], sourceKey: 'timeSeries' });
    expect(table).toMatchObject({ rows: [], sourceKey: 'brandLeaderboard' });
    expect(top).toMatchObject({ posts: [], sourceKey: 'topPosts' });
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

  it('leaves placeholders when the bundle cannot resolve a sourceKey', () => {
    const { document } = sanitizeLayoutForPersistence(validLayout);
    const hydrated = hydrateLayout(document, { analytics: {} });

    const metric = hydrated[0];
    expect(metric).toMatchObject({ type: 'metric_card', value: '' });
    expect(metric.hydration?.status).not.toBe('ready');
  });
});
