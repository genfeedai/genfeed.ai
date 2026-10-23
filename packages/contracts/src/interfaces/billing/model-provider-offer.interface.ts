import type { ReviewedProviderRate } from './model-pricing.interface';

export interface AdminModelProviderOffer {
  id: string;
  executionModelId: string;
  executionModelKey: string;
  provider: string;
  endpoint: string;
  isActive: boolean;
  isProviderActive: boolean;
  priority: number;
  hasReviewedPricing: boolean;
  isRegistrationActive: boolean;
  rates: ReviewedProviderRate[];
  sourceUrl: string | null;
  verifiedAt: string | null;
}
export interface AdminModelUsagePoint {
  date: string;
  provider: string;
  generations: number;
  vendorCostUsd: number;
}
export interface AdminModelDetail {
  description: string | null;
  marginMultiplier: number;
  id: string;
  label: string;
  key: string;
  category: string;
  isActive: boolean;
  pinnedProvider: string | null;
  offers: AdminModelProviderOffer[];
  candidates: AdminProviderRegistrationCandidate[];
  usage: AdminModelUsagePoint[];
  periodDays: number;
}
export interface UpdateModelProviderRouting {
  label?: string;
  description?: string;
  isModelActive?: boolean;
  pinnedProvider?: string | null;
  executionModelId?: string;
  isActive?: boolean;
  priority?: number;
}
export interface RoutedModelDispatch {
  fallback?: Omit<RoutedModelDispatch, 'fallback'> & {
    rateVersion: string | null;
    providerCostUsd: number;
  };
  offerId: string;
  executionModelKey: string;
  endpoint: string;
  provider: string;
  schemaFamily: string | null;
}

export interface AdminProviderRegistrationCandidate {
  id: string;
  key: string;
  provider: string;
  label: string;
}
