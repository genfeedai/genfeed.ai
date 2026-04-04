import type { AgentStrategy } from '@genfeedai/agent/models/agent-strategy.model';
import { create } from 'zustand';

interface AgentStrategyState {
  strategy: AgentStrategy | null;
  strategies: AgentStrategy[];
  isLoading: boolean;
  error: string | null;
}

interface AgentStrategyActions {
  setStrategy: (strategy: AgentStrategy | null) => void;
  setStrategies: (strategies: AgentStrategy[]) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
}

export type AgentStrategyStore = AgentStrategyState & AgentStrategyActions;

export const useAgentStrategyStore = create<AgentStrategyStore>((set) => ({
  error: null,
  isLoading: false,
  setError: (error) => set({ error }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setStrategies: (strategies) => set({ strategies }),
  setStrategy: (strategy) => set({ strategy }),
  strategies: [],
  strategy: null,
}));
