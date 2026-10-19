/**
 * Platform-admin unit economics (superadmin only). Money is USD; credits are
 * ledger credits (1 credit = $0.01 retail). Provider costs come from the
 * `llm_vendor_costs` / `media_vendor_costs` ledgers (BYOK rows cost 0);
 * revenue comes from `billing_revenue_events` (net of tax).
 */

import type {
  UnitEconomicsSortDirection,
  UnitEconomicsSortKey,
} from '../../constants/unit-economics.constant';
import type { IPaginationParams } from '../core/common.interface';

export interface IUnitEconomicsQuery {
  from?: string;
  limit?: number;
  /** When set, the report drills into this organization's users. */
  organizationId?: string;
  page?: number;
  /** Defaults to provider cost, highest first. */
  sortDirection?: UnitEconomicsSortDirection;
  sortKey?: UnitEconomicsSortKey;
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
  /** Which page of rows this report carries, with the total row count. */
  pagination: IPaginationParams;
  /** One sorted page of rows. */
  rows: IUnitEconomicsRow[];
  to: string;
  /** Summed across every row, not just this page. */
  totals: IUnitEconomicsMetrics;
}
