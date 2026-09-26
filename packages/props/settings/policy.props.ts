import type { AgentAutonomyMode } from '@genfeedai/contracts';
import type {
  IModel,
  IOrganizationSetting,
} from '@genfeedai/contracts/interfaces';

export type AgentPolicyState = NonNullable<IOrganizationSetting['agentPolicy']>;

/**
 * Per-selector enabled-model options for the generation/review/thinking
 * override pickers, scoped to each selector's own category — never the full
 * model catalog. See `resolveEnabledModelsForCategory` in
 * `resolve-enabled-model-options.ts`.
 */
export type OverrideCategoryModels = {
  generation: Array<Pick<IModel, 'id' | 'key'>>;
  review: Array<Pick<IModel, 'id' | 'key'>>;
  thinking: Array<Pick<IModel, 'id' | 'key'>>;
};

export type QualityTierOption = {
  description: string;
  label: string;
  value: NonNullable<AgentPolicyState['qualityTierDefault']>;
};

export type AgentPolicyCardProps = {
  autonomyDefault: AgentAutonomyMode;
  isSaving: boolean;
  onAutonomyDefaultChange: (value: AgentAutonomyMode) => void;
  onQualityTierDefaultChange: (
    value: NonNullable<AgentPolicyState['qualityTierDefault']>,
  ) => void;
  qualityTierDefault: NonNullable<AgentPolicyState['qualityTierDefault']>;
  qualityTierOptions: QualityTierOption[];
};

export type CreditGovernanceCardProps = {
  agentDailyCreditCap: string;
  brandDailyCreditCap: string;
  onAgentDailyCreditCapChange: (value: string) => void;
  onBrandDailyCreditCapChange: (value: string) => void;
};

export type PolicyFormState = {
  agentDailyCreditCap: string;
  allowAdvancedOverrides: boolean;
  autonomyDefault: AgentAutonomyMode;
  brandDailyCreditCap: string;
  generationModelOverride: string;
  isSaving: boolean;
  qualityTierDefault: NonNullable<AgentPolicyState['qualityTierDefault']>;
  reviewModelOverride: string;
  thinkingModelOverride: string;
};

export type PolicyFormAction =
  | { payload: PolicyFormState; type: 'INIT_FROM_SETTINGS' }
  | { payload: Partial<PolicyFormState>; type: 'MERGE' }
  | { payload: boolean; type: 'SET_IS_SAVING' };
