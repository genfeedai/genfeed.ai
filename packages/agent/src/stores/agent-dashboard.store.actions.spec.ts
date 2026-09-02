import {
  AGENT_DASHBOARD_STORAGE_KEY,
  useAgentDashboardStore,
} from '@genfeedai/agent/stores/agent-dashboard.store';
import type { AgentUIBlock } from '@genfeedai/contracts/interfaces';
import { beforeEach, describe, expect, it } from 'vitest';

function makeMetricCard(id: string, value = 1): AgentUIBlock {
  return {
    id,
    title: `Metric ${id}`,
    type: 'metric_card',
    value,
  };
}

describe('agent-dashboard.store actions', () => {
  beforeEach(() => {
    localStorage.clear();
    useAgentDashboardStore.setState({
      blocks: [],
      isAgentModified: false,
    });
  });

  it('setBlocks replaces the dashboard and persists it', () => {
    useAgentDashboardStore
      .getState()
      .setBlocks([makeMetricCard('a'), makeMetricCard('b')]);

    const state = useAgentDashboardStore.getState();
    expect(state.blocks).toHaveLength(2);
    expect(state.isAgentModified).toBe(true);
    expect(localStorage.getItem(AGENT_DASHBOARD_STORAGE_KEY)).toContain(
      'Metric a',
    );
  });

  it('addBlock inserts at a specific index', () => {
    useAgentDashboardStore
      .getState()
      .setBlocks([makeMetricCard('a'), makeMetricCard('c')]);

    useAgentDashboardStore.getState().addBlock(makeMetricCard('b'), 1);

    expect(
      useAgentDashboardStore.getState().blocks.map((block) => block.id),
    ).toEqual(['a', 'b', 'c']);
  });

  it('removeBlock drops only the matching block', () => {
    useAgentDashboardStore
      .getState()
      .setBlocks([makeMetricCard('a'), makeMetricCard('b')]);

    useAgentDashboardStore.getState().removeBlock('a');

    expect(
      useAgentDashboardStore.getState().blocks.map((block) => block.id),
    ).toEqual(['b']);
  });

  it('reorderBlocks reorders by ids and drops unknown ids', () => {
    useAgentDashboardStore
      .getState()
      .setBlocks([
        makeMetricCard('a'),
        makeMetricCard('b'),
        makeMetricCard('c'),
      ]);

    useAgentDashboardStore.getState().reorderBlocks(['c', 'a', 'missing']);

    expect(
      useAgentDashboardStore.getState().blocks.map((block) => block.id),
    ).toEqual(['c', 'a']);
  });

  it('clearAll empties the dashboard but keeps the modified flag', () => {
    useAgentDashboardStore.getState().setBlocks([makeMetricCard('a')]);

    useAgentDashboardStore.getState().clearAll();

    const state = useAgentDashboardStore.getState();
    expect(state.blocks).toEqual([]);
    expect(state.isAgentModified).toBe(true);
  });

  it('resetToDefaults clears blocks and the modified flag', () => {
    useAgentDashboardStore.getState().setBlocks([makeMetricCard('a')]);

    useAgentDashboardStore.getState().resetToDefaults();

    const state = useAgentDashboardStore.getState();
    expect(state.blocks).toEqual([]);
    expect(state.isAgentModified).toBe(false);
  });

  it('hydrateState normalizes and persists incoming state', () => {
    useAgentDashboardStore.getState().hydrateState({
      blocks: [makeMetricCard('remote')],
      isAgentModified: true,
    });

    const state = useAgentDashboardStore.getState();
    expect(state.blocks[0]).toEqual(
      expect.objectContaining({ id: 'remote', type: 'metric_card' }),
    );
    expect(state.isAgentModified).toBe(true);
  });

  it('hydrateState with invalid blocks fails closed as agent-modified', () => {
    useAgentDashboardStore.getState().hydrateState({
      blocks: [{ id: 'bad', type: 'iframe' }] as unknown as AgentUIBlock[],
      isAgentModified: false,
    });

    expect(useAgentDashboardStore.getState().isAgentModified).toBe(true);
  });

  it('getLocalSnapshot reads the persisted state back', () => {
    useAgentDashboardStore.getState().setBlocks([makeMetricCard('persisted')]);

    const snapshot = useAgentDashboardStore.getState().getLocalSnapshot();

    expect(snapshot.blocks[0]).toEqual(
      expect.objectContaining({ id: 'persisted' }),
    );
    expect(snapshot.isAgentModified).toBe(true);
  });

  it('getLocalSnapshot falls back to the legacy storage key', () => {
    localStorage.setItem(
      'genfeed-agent-dashboard-blocks',
      JSON.stringify({
        blocks: [makeMetricCard('legacy')],
        isAgentModified: false,
      }),
    );

    const snapshot = useAgentDashboardStore.getState().getLocalSnapshot();

    expect(snapshot.blocks[0]).toEqual(
      expect.objectContaining({ id: 'legacy' }),
    );
  });

  it('getLocalSnapshot survives corrupted storage', () => {
    localStorage.setItem(AGENT_DASHBOARD_STORAGE_KEY, '{not json');

    expect(useAgentDashboardStore.getState().getLocalSnapshot()).toEqual({
      blocks: [],
      isAgentModified: false,
    });
  });
});
