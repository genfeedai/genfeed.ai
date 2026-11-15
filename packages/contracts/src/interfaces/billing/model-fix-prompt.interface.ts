/** Why a model is on the fix-prompt list. */
export type ModelFixProblem =
  | 'price-changed'
  | 'removed-by-provider'
  | 'new-draft'
  | 'unreadable'
  | 'data-error'
  | 'below-cost'
  | 'unpriced';

/**
 * What the prompt is for: the models a scan flagged, the models the admin
 * pricing report flags today, or a full audit of every active price.
 */
export type ModelFixPromptScope = 'scan-run' | 'attention' | 'audit-all';

export interface ModelFixPromptItem {
  key: string;
  provider: string;
  category: string;
  problem: ModelFixProblem;
  /** Provider cost is above the sell price: lead with it. */
  isUrgent?: boolean;
  /** The provider page the price is read from, when known. */
  sourceUrl?: string | null;
  /** One line: what the scan or report saw (old → new price, error code, reason). */
  detail: string;
}

export interface ModelFixPromptInput {
  scope: ModelFixPromptScope;
  /** Set when the scope is one provider's scan run. */
  provider?: string;
  items: ModelFixPromptItem[];
  /** Admin models page, shown so the operator can open the list. */
  adminUrl?: string | null;
}

export interface ModelFixPromptOptions {
  /** List at most this many models, then point at the audit prompt (Discord card). */
  maxItems?: number;
}
