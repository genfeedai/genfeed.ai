import type { CostTier } from '@genfeedai/enums';

/**
 * @deprecated Prefer full `IModel` rows from the registry for any new picker.
 * Agent chat / generation UI feed `ModelSelectorPopover` with `IModel` only.
 * Kept as a transitional type export for any residual call sites still using
 * the lightweight picker row shape.
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
