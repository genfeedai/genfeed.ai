import type { AgentAutonomyMode } from '@genfeedai/contracts';
import type { IOrganizationSetting } from '@genfeedai/contracts/interfaces';

export type AgentPolicyState = NonNullable<IOrganizationSetting['agentPolicy']>;

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
