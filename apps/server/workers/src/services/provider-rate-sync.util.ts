import { parseContractReviewedPricing } from '@api/collections/models/utils/model-billable-pricing-profile.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  ModelPricingRateChange,
  ReviewedProviderPricing,
} from '@genfeedai/contracts/interfaces';
import {
  describeProviderRateChanges,
  hashReviewedProviderRates,
} from '@genfeedai/pricing';
import type { ModelProviderContract } from '@genfeedai/prisma';

/** The registry row facts the rate comparison needs. */
export interface RateSyncModelRecord {
  endpoint: string;
  isFree?: boolean;
  provider: string;
  reviewedProviderContractVersion?: string | null;
}

export interface ReviewedRateContract {
  contract: ModelProviderContract;
  pricing: ReviewedProviderPricing;
}

/**
 * The reviewed contract and its normalized rates, or null when the model has
 * none (never reviewed, or reviewed on evidence that carries no readable rates).
 */
export async function loadReviewedRateContract(
  prisma: PrismaService,
  model: RateSyncModelRecord,
): Promise<ReviewedRateContract | null> {
  if (!model.reviewedProviderContractVersion) return null;
  const contract = await prisma.modelProviderContract.findUnique({
    where: {
      provider_endpoint_version: {
        endpoint: model.endpoint,
        provider: model.provider,
        version: model.reviewedProviderContractVersion,
      },
    },
  });
  if (contract?.reviewStatus !== 'approved') return null;
  const pricing = parseContractReviewedPricing(
    { ...model, isFree: model.isFree ?? false },
    contract,
  );
  return pricing ? { contract, pricing } : null;
}

export type RateComparison =
  | { status: 'unchanged' }
  | {
      status: 'changed';
      changes: ModelPricingRateChange[];
      pendingRateHash: string;
    };

/** Drift is a difference in normalized rates, never in schema or provider version. */
export function compareProviderRates(
  reviewed: ReviewedProviderPricing,
  observed: ReviewedProviderPricing,
): RateComparison {
  const pendingRateHash = hashReviewedProviderRates(observed.rates);
  if (pendingRateHash === hashReviewedProviderRates(reviewed.rates))
    return { status: 'unchanged' };
  return {
    changes: describeProviderRateChanges(reviewed.rates, observed.rates),
    pendingRateHash,
    status: 'changed',
  };
}
