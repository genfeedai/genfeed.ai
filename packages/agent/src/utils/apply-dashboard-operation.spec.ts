import { useAgentDashboardStore } from '@genfeedai/agent/stores/agent-dashboard.store';
import { applyDashboardOperation } from '@genfeedai/agent/utils/apply-dashboard-operation';
import { beforeEach, describe, expect, it } from 'vitest';

describe('applyDashboardOperation', () => {
  beforeEach(() => {
    useAgentDashboardStore.setState({
      blocks: [],
      isAgentModified: false,
    });
  });

  it('stores validated dashboard blocks for replace operations', () => {
    applyDashboardOperation('replace', [
      {
        id: 'views',
        title: 'Views',
        type: 'metric_card',
        value: 1200,
      },
    ]);

    expect(useAgentDashboardStore.getState().blocks).toEqual([
      expect.objectContaining({
        id: 'views',
        type: 'metric_card',
        value: 1200,
      }),
    ]);
  });

  it('fails closed when a dashboard operation contains unsupported blocks', () => {
    applyDashboardOperation('replace', [
      {
        id: 'unsafe',
        type: 'script',
      },
    ]);

    expect(useAgentDashboardStore.getState().blocks).toEqual([
      expect.objectContaining({
        id: 'dashboard-renderer-unsupported-tree',
        type: 'empty_state',
      }),
    ]);
  });

  it('accepts registered OpenUI dashboard documents', () => {
    applyDashboardOperation('replace', {
      components: [
        {
          component: 'Dashboard.MetricCard',
          props: {
            id: 'openui-views',
            title: 'Views',
            value: 42,
          },
        },
      ],
      version: 'genfeed.dashboard.openui.v1',
    });

    expect(useAgentDashboardStore.getState().blocks).toEqual([
      expect.objectContaining({
        id: 'openui-views',
        type: 'metric_card',
      }),
    ]);
  });

  it('filters remove ids to strings', () => {
    applyDashboardOperation('replace', [
      {
        id: 'keep',
        title: 'Keep',
        type: 'metric_card',
        value: 1,
      },
      {
        id: 'remove',
        title: 'Remove',
        type: 'metric_card',
        value: 2,
      },
    ]);

    applyDashboardOperation('remove', undefined, ['remove', 42]);

    expect(useAgentDashboardStore.getState().blocks).toEqual([
      expect.objectContaining({
        id: 'keep',
      }),
    ]);
  });
});
