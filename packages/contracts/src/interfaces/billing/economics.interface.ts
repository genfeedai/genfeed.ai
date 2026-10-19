/**
 * Platform-admin economics reports (superadmin only). Money is USD; credits are
 * ledger credits (1 credit = $0.01 retail). Revenue comes from
 * `billing_revenue_events` (net of tax), provider cost from the
 * `llm_vendor_costs` / `media_vendor_costs` ledgers (BYOK rows cost 0), and
 * credits from the `credit_transactions` usage rows.
 *
 * Every report covers whole UTC days from `from` to `to` inclusive.
 */

export interface IEconomicsQuery {
  from?: string;
  to?: string;
}

/** Operations whose credit spend is compared against recorded provider cost. */
export type EconomicsOperation =
  | 'agent_chat'
  | 'avatar'
  | 'image'
  | 'music'
  | 'other'
  | 'video'
  | 'voice';

export type EconomicsLedgerKey = 'credits' | 'llm' | 'media' | 'revenue';

export type EconomicsOperationStatus = 'missing' | 'tracked';

export interface IEconomicsTotals {
  /** Organizations that spent credits in the period. */
  activeOrganizations: number;
  creditsConsumed: number;
  /** Retail value of the credits consumed. */
  creditValueUsd: number;
  /** Cash margin: revenue minus provider cost. */
  grossMarginUsd: number;
  grossMarginPercent: number | null;
  llmCalls: number;
  llmCostUsd: number;
  mediaCostUsd: number;
  mediaGenerations: number;
  /** Organizations with a Stripe payment in the period. */
  payingOrganizations: number;
  /** Pricing margin: retail value of credits consumed minus provider cost. */
  pricingMarginUsd: number;
  pricingMarginPercent: number | null;
  providerCostUsd: number;
  revenueEvents: number;
  revenueUsd: number;
}

export interface IEconomicsDailyPoint {
  creditValueUsd: number;
  /** UTC day, `YYYY-MM-DD`. */
  date: string;
  llmCostUsd: number;
  mediaCostUsd: number;
  revenueUsd: number;
}

export interface IEconomicsOverviewReport {
  daily: IEconomicsDailyPoint[];
  from: string;
  previousFrom: string;
  previousTo: string;
  previousTotals: IEconomicsTotals;
  to: string;
  totals: IEconomicsTotals;
}

export interface IEconomicsRevenueTotals {
  averageRevenuePerEventUsd: number;
  events: number;
  payingOrganizations: number;
  revenueUsd: number;
}

export interface IEconomicsRevenueDailyPoint {
  creditPackUsd: number;
  date: string;
  subscriptionUsd: number;
}

export interface IEconomicsRevenueSourceRow {
  events: number;
  revenueUsd: number;
  /** `BillingRevenueSource` value. */
  source: string;
}

export interface IEconomicsRevenueOrganizationRow {
  events: number;
  id: string;
  label: string;
  revenueUsd: number;
}

export interface IEconomicsRevenueEvent {
  amountUsd: number;
  id: string;
  occurredAt: string;
  organizationId: string;
  organizationLabel: string;
  source: string;
  stripeObjectId: string;
}

export interface IEconomicsRevenueReport {
  daily: IEconomicsRevenueDailyPoint[];
  from: string;
  /** Newest events in the period, capped at `latestEventsLimit`. */
  latestEvents: IEconomicsRevenueEvent[];
  latestEventsLimit: number;
  /** When the revenue ledger recorded its first payment; null when empty. */
  ledgerStartedAt: string | null;
  /** Payments in the period in a currency other than USD (not in totals). */
  nonUsdEvents: number;
  sources: IEconomicsRevenueSourceRow[];
  to: string;
  topOrganizations: IEconomicsRevenueOrganizationRow[];
  totals: IEconomicsRevenueTotals;
}

export type EconomicsCostKind = 'llm' | 'media';

export interface IEconomicsCostTotals {
  byokCalls: number;
  llmCalls: number;
  llmCostUsd: number;
  mediaCostUsd: number;
  mediaGenerations: number;
  providerCostUsd: number;
  /** Non-BYOK calls the ledger recorded at $0: the price was unknown. */
  unpricedCalls: number;
}

export interface IEconomicsCostDailyPoint {
  date: string;
  llmCostUsd: number;
  mediaCostUsd: number;
}

export interface IEconomicsCostModelRow {
  averageCostUsd: number;
  byokCalls: number;
  calls: number;
  /** LLM completion tokens; 0 for media. */
  completionTokens: number;
  costUsd: number;
  kind: EconomicsCostKind;
  model: string;
  /** LLM prompt tokens; 0 for media. */
  promptTokens: number;
  provider: string;
  unpricedCalls: number;
}

export interface IEconomicsCostCategoryRow {
  /** Ingredient category of the generation, e.g. `IMAGE`. */
  category: string;
  costUsd: number;
  generations: number;
}

export interface IEconomicsCostReport {
  daily: IEconomicsCostDailyPoint[];
  from: string;
  mediaCategories: IEconomicsCostCategoryRow[];
  models: IEconomicsCostModelRow[];
  to: string;
  totals: IEconomicsCostTotals;
}

export interface IEconomicsLedgerCoverage {
  byokRows: number;
  /** First and last row ever written to the ledger; null when it is empty. */
  firstRecordedAt: string | null;
  key: EconomicsLedgerKey;
  lastRecordedAt: string | null;
  /** Provider-cost rows still waiting for a settled cost. */
  pendingRows: number;
  periodRows: number;
  /** Non-BYOK provider-cost rows recorded at $0. */
  unpricedRows: number;
}

export interface IEconomicsOperationCoverage {
  /** Provider cost recorded for the operation. */
  costUsd: number;
  credits: number;
  creditValueUsd: number;
  operation: EconomicsOperation;
  pricingMarginUsd: number;
  /** `missing`: credits were spent but no provider cost was recorded. */
  status: EconomicsOperationStatus;
}

export interface IEconomicsCoverageReport {
  from: string;
  ledgers: IEconomicsLedgerCoverage[];
  operations: IEconomicsOperationCoverage[];
  to: string;
}
