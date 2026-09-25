import type { IUnitEconomicsRow } from '@genfeedai/contracts/interfaces';

/** A report row, or the synthetic totals row pinned under the sorted rows. */
export interface UnitEconomicsTableRow extends IUnitEconomicsRow {
  isTotal: boolean;
}

export type UnitEconomicsSortKey =
  | 'agentChatCredits'
  | 'agentTurns'
  | 'generationCredits'
  | 'grossMarginPercent'
  | 'grossMarginUsd'
  | 'label'
  | 'llmProviderCostUsd'
  | 'mediaProviderCostUsd'
  | 'revenueUsd';

export interface UnitEconomicsDrillDown {
  id: string;
  label: string;
}
