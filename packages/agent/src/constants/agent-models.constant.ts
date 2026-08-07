import type { CostTier } from '@genfeedai/enums';

/**
 * Picker row shape for agent chat / media model selectors.
 *
 * Runtime lists come from the Model registry (`useAgentRegistryModels`).
 * Do not reintroduce a hard-coded AGENT_MODELS array here — that dual-sourced
 * the picker against seed constants.
 */
export interface AgentModelOption {
  key: string;
  label: string;
  description: string;
  creditCost?: number;
  costTier?: CostTier;
  brandSlug: string;
  isReasoning?: boolean;
}
