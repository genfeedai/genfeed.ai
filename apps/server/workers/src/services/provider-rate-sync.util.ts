import { parseContractReviewedPricing } from '@api/collections/models/utils/model-billable-pricing-profile.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  ModelPricingRateChange,
  ReviewedProviderPricing,
} from '@genfeedai/contracts/interfaces';
import {
  describeProviderRateChanges,
  hashReviewedRateSheetEntry,
} from '@genfeedai/pricing';
import type { ModelProviderContract, Prisma } from '@genfeedai/prisma';

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

function isEmptyJson(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === 'object' && Object.keys(value).length === 0)
  );
}

/**
 * Schema columns to backfill on a reviewed contract that lost them: an
 * identical-rate refresh repairs an empty output schema from the observed one.
 */
export function reviewedSchemaRepair(
  reviewed: ModelProviderContract,
  observed: {
    inputSchema: unknown;
    openapi: unknown;
    outputSchema: unknown;
    schemaFamily: string | null;
  },
): Prisma.ModelProviderContractUpdateInput | null {
  if (!isEmptyJson(reviewed.outputSchema) || isEmptyJson(observed.outputSchema))
    return null;
  return {
    inputSchema: observed.inputSchema as Prisma.InputJsonValue,
    openapi: observed.openapi as Prisma.InputJsonValue,
    outputSchema: observed.outputSchema as Prisma.InputJsonValue,
    ...(observed.schemaFamily ? { schemaFamily: observed.schemaFamily } : {}),
  };
}

export type RateComparison =
  | { status: 'unchanged' }
  | {
      status: 'changed';
      changes: ModelPricingRateChange[];
      pendingRateHash: string;
    };

/** Drift is a difference in normalized rates or frozen billing rules; unrelated schema and provider version changes do not count. */
export function compareProviderRates(
  reviewed: ReviewedProviderPricing,
  observed: ReviewedProviderPricing,
): RateComparison {
  const pendingRateHash = hashReviewedRateSheetEntry(observed);
  if (pendingRateHash === hashReviewedRateSheetEntry(reviewed))
    return { status: 'unchanged' };
  return {
    changes: describeProviderRateChanges(reviewed.rates, observed.rates),
    pendingRateHash,
    status: 'changed',
  };
}
