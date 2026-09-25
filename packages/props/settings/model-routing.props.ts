import type { IAgentModelAccess } from '@genfeedai/contracts/interfaces';

export type EnabledModelOption = {
  label: string;
  value: string;
};

export type AdvancedRoutingCardProps = {
  /** Free-tier lock: when locked, the thinking model is fixed and not selectable. */
  agentModelAccess: IAgentModelAccess | null;
  allowAdvancedOverrides: boolean;
  generationModelOverride: string;
  modelOptions: EnabledModelOption[];
  isSaving: boolean;
  /** Estimated credits for an average agent message, keyed by model key. */
  modelCostEstimates: Record<string, number>;
  onAllowAdvancedOverridesChange: (checked: boolean) => void;
  onGenerationModelOverrideChange: (value: string) => void;
  onReviewModelOverrideChange: (value: string) => void;
  onThinkingModelOverrideChange: (value: string) => void;
  reviewModelOverride: string;
  thinkingModelOverride: string;
};

export type AgentModelLockNoticeProps = {
  className?: string;
  lockedModelLabel: string;
};
