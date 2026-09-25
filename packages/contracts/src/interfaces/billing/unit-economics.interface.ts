/**
 * Platform-admin unit economics (superadmin only). Money is USD; credits are
 * ledger credits (1 credit = $0.01 retail). Provider costs come from the
 * `llm_vendor_costs` / `media_vendor_costs` ledgers (BYOK rows cost 0);
 * revenue comes from `billing_revenue_events` (net of tax).
 */

export interface IUnitEconomicsQuery {
  from?: string;
  /** When set, the report drills into this organization's users. */
  organizationId?: string;
  to?: string;
}

export interface IUnitEconomicsTopModel {
  model: string;
  providerCostUsd: number;
}

export interface IUnitEconomicsMetrics {
  agentChatCredits: number;
  agentTurns: number;
  generationCredits: number;
  /** Revenue minus LLM and generation provider cost. */
  grossMarginUsd: number;
  /** Gross margin over revenue, as a percentage; null without revenue. */
  grossMarginPercent: number | null;
  llmProviderCostUsd: number;
  mediaProviderCostUsd: number;
  revenueUsd: number;
}

export interface IUnitEconomicsRow extends IUnitEconomicsMetrics {
  /** Organization id, or user id in a drill-down. */
  id: string;
  label: string;
  topModels: IUnitEconomicsTopModel[];
}

export interface IUnitEconomicsReport {
  from: string;
  /** Present on a per-user drill-down. */
  organizationId: string | null;
  organizationLabel: string | null;
  rows: IUnitEconomicsRow[];
  to: string;
  totals: IUnitEconomicsMetrics;
}
