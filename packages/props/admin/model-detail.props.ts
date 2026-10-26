import type { AdminModelDetail } from '@genfeedai/contracts/interfaces';

export type AdminModelOffer = AdminModelDetail['offers'][number];

export interface AdminModelPricingRow {
  key: string;
  offer: AdminModelOffer;
  rate: AdminModelOffer['rates'][number] | null;
}

export interface AdminModelProviderUsage {
  provider: string;
  generations: number;
  vendorCostUsd: number;
}
