import type { AgentStrategy } from '@genfeedai/agent/models/agent-strategy.model';
import { useAgentStrategyStore } from '@genfeedai/agent/stores/agent-strategy.store';
import { beforeEach, describe, expect, it } from 'vitest';

function makeStrategy(id: string): AgentStrategy {
  return { id, name: `Strategy ${id}` } as unknown as AgentStrategy;
}

describe('useAgentStrategyStore', () => {
  beforeEach(() => {
    useAgentStrategyStore.setState(
      useAgentStrategyStore.getInitialState(),
      true,
    );
  });

  it('starts empty and not loading', () => {
    const state = useAgentStrategyStore.getState();

    expect(state.strategy).toBeNull();
    expect(state.strategies).toEqual([]);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('sets and clears the active strategy', () => {
    const strategy = makeStrategy('s-1');

    useAgentStrategyStore.getState().setStrategy(strategy);
    expect(useAgentStrategyStore.getState().strategy).toBe(strategy);

    useAgentStrategyStore.getState().setStrategy(null);
    expect(useAgentStrategyStore.getState().strategy).toBeNull();
  });

  it('replaces the strategy list', () => {
    const strategies = [makeStrategy('s-1'), makeStrategy('s-2')];

    useAgentStrategyStore.getState().setStrategies(strategies);

    expect(useAgentStrategyStore.getState().strategies).toEqual(strategies);
  });

  it('tracks loading and error independently', () => {
    useAgentStrategyStore.getState().setIsLoading(true);
    expect(useAgentStrategyStore.getState().isLoading).toBe(true);

    useAgentStrategyStore.getState().setError('boom');
    expect(useAgentStrategyStore.getState().error).toBe('boom');
    expect(useAgentStrategyStore.getState().isLoading).toBe(true);

    useAgentStrategyStore.getState().setIsLoading(false);
    useAgentStrategyStore.getState().setError(null);
    expect(useAgentStrategyStore.getState().isLoading).toBe(false);
    expect(useAgentStrategyStore.getState().error).toBeNull();
  });
});
