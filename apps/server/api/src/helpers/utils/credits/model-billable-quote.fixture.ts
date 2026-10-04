import { ModelCreditQuoteService } from '@api/collections/models/services/model-credit-quote.service';
import type { ModelsService } from '@api/collections/models/services/models.service';
import type { ModelBillablePricingProfile } from '@genfeedai/contracts/interfaces';
import type { LoggerService } from '@libs/logger/logger.service';

/** Deliberately configured legacy tariff for unit tests, never a production fallback. */
export function billableProfile(
  overrides: Partial<ModelBillablePricingProfile> = {},
): ModelBillablePricingProfile {
  return {
    key: 'test/model',
    provider: 'replicate',
    isActive: true,
    isDeleted: false,
    isFree: false,
    pricingType: 'flat',
    cost: 10,
    costPerUnit: null,
    minCost: null,
    providerCostUsd: null,
    reviewedPricing: null,
    rateVersion: null,
    hasPendingRate: false,
    requiresReviewedRates: false,
    requiredSelectorKeys: [],
    ...overrides,
  };
}

/** Connect route fixtures to the real strict quote adapter using deliberate test tariffs. */
export function testModelCreditQuote(
  models: Pick<ModelsService, 'findOne'>,
  defaultProvider = 'replicate',
): ModelCreditQuoteService {
  return new ModelCreditQuoteService(
    {
      findBillablePricingProfile: async (key: string) => {
        const row = await models.findOne({ key });
        if (!row) return null;
        const evidence = row as unknown as Partial<ModelBillablePricingProfile>;
        return billableProfile({
          key: row.key ?? key,
          provider: row.provider ?? defaultProvider,
          cost: Object.hasOwn(row, 'cost') ? (row.cost ?? Number.NaN) : 10,
          costPerUnit: row.costPerUnit ?? null,
          minCost: row.minCost ?? null,
          providerCostUsd: row.providerCostUsd ?? null,
          pricingType: row.pricingType ?? 'flat',
          isFree: row.isFree ?? false,
          reviewedPricing: evidence.reviewedPricing ?? null,
          rateVersion: evidence.rateVersion ?? null,
          requiresReviewedRates: evidence.requiresReviewedRates ?? false,
          requiredSelectorKeys: evidence.requiredSelectorKeys ?? [],
          isActive: row.isActive ?? true,
          isDeleted: row.isDeleted ?? false,
        });
      },
    } as ModelsService,
    { warn: () => undefined } as unknown as LoggerService,
  );
}
