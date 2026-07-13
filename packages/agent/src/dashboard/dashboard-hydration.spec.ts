import {
  type DashboardHydrationData,
  hydrateLayout,
  isResolvableSourceKey,
  sanitizeLayoutForPersistence,
} from '@genfeedai/agent/dashboard/dashboard-hydration';
import type { AgentUIBlock } from '@genfeedai/interfaces';
import { describe, expect, it } from 'vitest';

// metric_card/kpi_grid + presentational blocks are fully hydratable from the
// `{ analytics }`-only bundle WorkspaceOverviewContent supplies today, so
// they're the only types `sanitizeLayoutForPersistence` currently accepts.
const persistableLayout: AgentUIBlock[] = [
  { id: 'posts', sourceKey: 'totalPosts', type: 'metric_card', value: 42 },
  { id: 'header', text: 'Overview', type: 'section_header' },
];

// chart/table/top_posts are rejected at persistence time (phase-1 gate in
// dashboard-hydration.ts) because no render call site fetches their backing
// collections yet — see `UNHYDRATABLE_PERSISTED_BLOCK_TYPES`. They're still
// exercised here directly against `hydrateLayout`/`parseLayoutInput` (which
// don't go through the persistence gate) to prove hydration itself still
// works once a full bundle is available.
const unhydratablePersistedBlocks: AgentUIBlock[] = [
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
  ...unhydratablePersistedBlocks,
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

  it('rejects chart/table/top_posts persistence even with a resolvable sourceKey (phase-1 hydration gate)', () => {
    const { issues } = sanitizeLayoutForPersistence(
      unhydratablePersistedBlocks,
    );

    expect(issues).toHaveLength(3);
    expect(issues.map((issue) => issue.path)).toEqual([
      'blocks[0].sourceKey',
      'blocks[1].sourceKey',
      'blocks[2].sourceKey',
    ]);
    for (const issue of issues) {
      expect(issue.code).toBe('invalid_props');
      expect(issue.message).toContain('cannot be persisted yet');
    }
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
