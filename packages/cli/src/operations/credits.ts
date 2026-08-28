import {
  PAYG_CREDIT_PACKS,
  PAYG_CREDITS_PER_USD,
  PAYG_MAX_PURCHASE_USD,
  PAYG_MIN_PURCHASE_USD,
} from '@genfeedai/pricing';
import {
  type CreditsCheckout,
  type CreditTransaction,
  createCreditsCheckout,
  getCreditUsage,
  listCreditTransactions,
} from '@/api/credits';
import { GenfeedError } from '@/utils/errors';

export interface CreditBalanceResult {
  balance: number;
  unit: 'credits';
}

export interface CreditPackResult {
  credits: number;
  label: string;
  usd: number;
}

export interface CreditPacksResult {
  creditsPerUsd: number;
  maximumCredits: number;
  minimumCredits: number;
  packs: CreditPackResult[];
}

export async function readCreditBalance(): Promise<CreditBalanceResult> {
  const usage = await getCreditUsage();
  return {
    balance: usage.currentBalance ?? 0,
    unit: 'credits',
  };
}

export function readCreditPacks(): CreditPacksResult {
  return {
    creditsPerUsd: PAYG_CREDITS_PER_USD,
    maximumCredits: PAYG_MAX_PURCHASE_USD * PAYG_CREDITS_PER_USD,
    minimumCredits: PAYG_MIN_PURCHASE_USD * PAYG_CREDITS_PER_USD,
    packs: PAYG_CREDIT_PACKS.map((pack) => ({
      credits: pack.credits,
      label: pack.label,
      usd: pack.credits / PAYG_CREDITS_PER_USD,
    })),
  };
}

export function parseCreditQuantity(value: string | number): number {
  const credits = typeof value === 'number' ? value : Number(value.trim());
  const { maximumCredits, minimumCredits } = readCreditPacks();

  if (!Number.isSafeInteger(credits) || credits < minimumCredits || credits > maximumCredits) {
    throw new GenfeedError(
      `Credits must be a whole number between ${minimumCredits.toLocaleString()} and ${maximumCredits.toLocaleString()}`
    );
  }

  return credits;
}

export async function startCreditsCheckout(credits: number): Promise<CreditsCheckout> {
  return await createCreditsCheckout(parseCreditQuantity(credits));
}

export async function readCreditHistory(limit: number): Promise<CreditTransaction[]> {
  return await listCreditTransactions(limit);
}
