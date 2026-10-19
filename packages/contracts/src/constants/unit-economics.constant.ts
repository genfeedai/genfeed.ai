/**
 * Columns the unit-economics report can be ordered by. The API sorts in the
 * database (the report is paged there), so the client sends one of these.
 */
export const UNIT_ECONOMICS_SORT_KEYS = [
  'agentChatCredits',
  'agentTurns',
  'generationCredits',
  'grossMarginPercent',
  'grossMarginUsd',
  'label',
  'llmProviderCostUsd',
  'mediaProviderCostUsd',
  'revenueUsd',
] as const;

export type UnitEconomicsSortKey = (typeof UNIT_ECONOMICS_SORT_KEYS)[number];

export type UnitEconomicsSortDirection = 'asc' | 'desc';
