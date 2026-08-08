import type { CostTier } from '@genfeedai/enums';

/**
 * Legacy lightweight picker row shape.
 *
 * Agent chat / generation UI now feed the shared `ModelSelectorPopover` with
 * full `IModel` rows from the registry. Prefer `IModel` for new code; this type
 * remains only for transitional call sites.
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
