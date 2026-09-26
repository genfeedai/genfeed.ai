import type { IAgentModelAccess } from '@genfeedai/contracts/interfaces';

export type EnabledModelOption = {
  label: string;
  value: string;
};

export type AdvancedRoutingCardProps = {
  /** Free-tier lock: when locked, the thinking model is fixed and not selectable. */
  agentModelAccess: IAgentModelAccess | null;
  allowAdvancedOverrides: boolean;
  generationModelOptions: EnabledModelOption[];
  generationModelOverride: string;
  /**
   * The stored override when it no longer matches an enabled model for this
   * selector (removed from the allowlist, a stale CUID) — `null` when it
   * resolves normally or is unset. Shown as an unresolved option instead of
   * silently falling back to Auto, so the admin corrects or clears it
   * explicitly rather than an unrelated save doing it silently.
   */
  generationModelOverrideUnresolvedKey: string | null;
  isSaving: boolean;
  /**
   * The model catalog itself hasn't settled yet (still fetching). Each
   * picker shows a loading placeholder instead of Auto or its options —
   * with no catalog, a stored override can't yet be told apart from unset.
   */
  isModelCatalogLoading: boolean;
  /** Estimated credits for an average agent message, keyed by model key. */
  modelCostEstimates: Record<string, number>;
  onAllowAdvancedOverridesChange: (checked: boolean) => void;
  onGenerationModelOverrideChange: (value: string) => void;
  onReviewModelOverrideChange: (value: string) => void;
  onThinkingModelOverrideChange: (value: string) => void;
  reviewModelOptions: EnabledModelOption[];
  reviewModelOverride: string;
  reviewModelOverrideUnresolvedKey: string | null;
  thinkingModelOptions: EnabledModelOption[];
  thinkingModelOverride: string;
  thinkingModelOverrideUnresolvedKey: string | null;
};

export type AgentModelLockNoticeProps = {
  className?: string;
  lockedModelLabel: string;
};

/** One override selector's props for AdvancedRoutingCard's shared picker. */
export type ModelOverridePickerProps = {
  autoOptionLabel: string;
  isModelCatalogLoading: boolean;
  onOverrideChange: (value: string) => void;
  options: EnabledModelOption[];
  override: string;
  renderOptionLabel?: (option: EnabledModelOption) => string;
  unresolvedKey: string | null;
  unresolvedNotice: string;
  unresolvedOptionLabel: string;
};
