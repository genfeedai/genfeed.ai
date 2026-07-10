import { useAgentDashboardStore } from '@genfeedai/agent/stores/agent-dashboard.store';
import type { AgentUIBlock } from '@genfeedai/interfaces';
import { beforeEach, describe, expect, it } from 'vitest';

const MAX_TOP_LEVEL_BLOCKS = 24;

function createMetricCard(id: string): AgentUIBlock {
  return {
    id,
    title: `Metric ${id}`,
    type: 'metric_card',
    value: 1,
  };
}

describe('agent-dashboard.store', () => {
  beforeEach(() => {
    localStorage.clear();
    useAgentDashboardStore.setState({
      blocks: [],
      isAgentModified: false,
    });
  });

  it('adds a valid block to the dashboard', () => {
    useAgentDashboardStore.getState().addBlock(createMetricCard('views'));

    expect(useAgentDashboardStore.getState().blocks).toEqual([
      expect.objectContaining({ id: 'views', type: 'metric_card' }),
    ]);
    expect(useAgentDashboardStore.getState().isAgentModified).toBe(true);
  });

  it('keeps the existing dashboard when addBlock exceeds the block cap', () => {
    const existing = Array.from({ length: MAX_TOP_LEVEL_BLOCKS }, (_, i) =>
      createMetricCard(`metric-${i}`),
    );
    useAgentDashboardStore.setState({
      blocks: existing,
      isAgentModified: false,
    });

    useAgentDashboardStore.getState().addBlock(createMetricCard('overflow'));

    const state = useAgentDashboardStore.getState();
    expect(state.blocks).toHaveLength(MAX_TOP_LEVEL_BLOCKS);
    expect(state.blocks[0]).toEqual(
      expect.objectContaining({ id: 'metric-0' }),
    );
    expect(state.isAgentModified).toBe(false);
  });

  it('keeps the existing dashboard when updateBlock produces an invalid block', () => {
    useAgentDashboardStore.setState({
      blocks: [createMetricCard('views')],
      isAgentModified: false,
    });

    useAgentDashboardStore
      .getState()
      .updateBlock('views', { value: Number.NaN });

    expect(useAgentDashboardStore.getState().blocks).toEqual([
      expect.objectContaining({ id: 'views', type: 'metric_card' }),
    ]);
  });

  it('updates a block when the merged result stays valid', () => {
    useAgentDashboardStore.setState({
      blocks: [createMetricCard('views')],
      isAgentModified: false,
    });

    useAgentDashboardStore.getState().updateBlock('views', { value: 99 });

    expect(useAgentDashboardStore.getState().blocks).toEqual([
      expect.objectContaining({ id: 'views', value: 99 }),
    ]);
  });
});
