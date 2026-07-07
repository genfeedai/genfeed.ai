import {
  DASHBOARD_OPENUI_COMPONENTS,
  parseAgentDashboardBlocks,
  parseDashboardOpenUIDocument,
} from '@genfeedai/agent/dashboard/dashboard-openui';
import { describe, expect, it } from 'vitest';

describe('dashboard OpenUI validation', () => {
  it('defines the registered dashboard component library', () => {
    expect(DASHBOARD_OPENUI_COMPONENTS).toContain('Dashboard.MetricCard');
    expect(DASHBOARD_OPENUI_COMPONENTS).toContain('Dashboard.KpiGrid');
    expect(DASHBOARD_OPENUI_COMPONENTS).toContain('Dashboard.Table');
  });

  it('converts registered OpenUI components into dashboard blocks', () => {
    const result = parseDashboardOpenUIDocument({
      components: [
        {
          component: 'Dashboard.KpiGrid',
          props: {
            cards: [
              {
                component: 'Dashboard.MetricCard',
                props: {
                  id: 'views',
                  title: 'Views',
                  value: 12400,
                },
              },
            ],
            columns: 1,
            id: 'summary',
            title: 'Summary',
          },
        },
      ],
      version: 'genfeed.dashboard.openui.v1',
    });

    expect(result.ok).toBe(true);
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]).toMatchObject({
      id: 'summary',
      type: 'kpi_grid',
    });
    if (result.blocks[0]?.type !== 'kpi_grid') {
      throw new Error('Expected KPI grid block');
    }
    expect(result.blocks[0].cards[0]).toMatchObject({
      id: 'views',
      type: 'metric_card',
      value: 12400,
    });
  });

  it('rejects unsupported OpenUI component trees', () => {
    const result = parseDashboardOpenUIDocument({
      components: [
        {
          component: 'script',
          props: {
            dangerouslySetInnerHTML: '<script>alert(1)</script>',
            id: 'bad',
          },
        },
      ],
      version: 'genfeed.dashboard.openui.v1',
    });

    expect(result.ok).toBe(false);
    expect(result.issues[0]?.code).toBe('unsupported_component');
    expect(result.blocks).toEqual([
      expect.objectContaining({
        id: 'dashboard-renderer-unsupported-tree',
        type: 'empty_state',
      }),
    ]);
  });

  it('rejects malformed supported dashboard blocks before render', () => {
    const result = parseAgentDashboardBlocks([
      {
        columns: [{ key: 'name', label: 'Name' }],
        id: 'broken-table',
        rows: 'not rows',
        type: 'table',
      },
    ]);

    expect(result.ok).toBe(false);
    expect(result.issues[0]?.path).toBe('blocks[0].rows');
    expect(result.blocks[0]).toMatchObject({
      type: 'empty_state',
    });
  });

  it('rejects renderer-unsupported chart variants', () => {
    const result = parseAgentDashboardBlocks([
      {
        chartType: 'funnel',
        data: [{ name: 'A', value: 1 }],
        id: 'funnel',
        type: 'chart',
      },
    ]);

    expect(result.ok).toBe(false);
    expect(result.issues[0]?.path).toBe('blocks[0].chartType');
  });

  it('rejects unsafe image URLs', () => {
    const result = parseAgentDashboardBlocks([
      {
        id: 'assets',
        images: [{ url: 'javascript:alert(1)' }],
        type: 'image_grid',
      },
    ]);

    expect(result.ok).toBe(false);
    expect(result.issues[0]?.path).toBe('blocks[0].images[0].url');
  });
});
