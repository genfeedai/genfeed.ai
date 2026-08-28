import { get, post } from './client';
import {
  flattenCollection,
  flattenSingle,
  type JsonApiCollectionResponse,
  type JsonApiSingleResponse,
} from './json-api';

export interface CreditUsage {
  currentBalance?: number;
  usage7Days?: number;
  usage30Days?: number;
  trendPercentage?: number;
  breakdown?: Array<{ source: string; amount: number; count: number }>;
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

export interface CreditsCheckout {
  id?: string;
  url: string;
}

export interface CreditTransaction {
  id: string;
  amount: number;
  balanceAfter: number;
  category: string;
  createdAt: string;
  description?: string;
  referenceId?: string;
  referenceType?: string;
  source?: string;
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

export async function createCreditsCheckout(
  credits: number,
  signal?: AbortSignal
): Promise<CreditsCheckout> {
  const body = { credits };
  const response = signal
    ? await post<JsonApiSingleResponse>('/services/stripe/credits/checkout', body, { signal })
    : await post<JsonApiSingleResponse>('/services/stripe/credits/checkout', body);
  return flattenSingle<CreditsCheckout>(response);
}

export async function listCreditTransactions(limit = 50): Promise<CreditTransaction[]> {
  const normalizedLimit = Math.trunc(limit);
  const boundedLimit = Number.isFinite(normalizedLimit)
    ? Math.min(Math.max(normalizedLimit, 1), 200)
    : 50;
  const response = await get<JsonApiCollectionResponse>(
    `/credits/transactions?limit=${boundedLimit}`
  );
  return flattenCollection<CreditTransaction>(response);
}
