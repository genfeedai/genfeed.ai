import { get } from './client.js';
import { flattenSingle, type JsonApiSingleResponse } from './json-api.js';

export interface CreditUsage {
  currentBalance?: number;
  usage7Days?: number;
  usage30Days?: number;
  trendPercentage?: number;
  breakdown?: Array<{ source: string; amount: number; count: number }>;
  // Backward-compatible fields for older API responses
  total?: number;
  used?: number;
  remaining?: number;
  byCategory?: Record<string, number>;
  period?: string;
}

export interface CreditSummary {
  totalUsage: number;
  billableUsage: number;
  freeRemaining: number;
  projectedFee?: number;
  billingPeriod?: string;
  resetDate?: string;
}

export interface LastPurchaseBaseline {
  lastPurchaseCredits: number;
  usedSinceLastPurchase: number;
  currentBalance: number;
  usedPercent: number;
  lastPurchaseAt: string | null;
}

export async function getCreditUsage(): Promise<CreditUsage> {
  const response = await get<JsonApiSingleResponse>('/credits/usage');
  return flattenSingle<CreditUsage>(response);
}

export async function getCreditSummary(): Promise<CreditSummary> {
  const response = await get<JsonApiSingleResponse>('/credits/byok-usage-summary');
  return flattenSingle<CreditSummary>(response);
}

export async function getLastPurchaseBaseline(): Promise<LastPurchaseBaseline> {
  const response = await get<JsonApiSingleResponse>('/credits/last-purchase-baseline');
  return flattenSingle<LastPurchaseBaseline>(response);
}
