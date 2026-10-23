import { projectModelBillablePricingProfile } from '@api/collections/models/utils/model-billable-pricing-profile.util';
import { mapProviderOfferInput } from '@api/collections/models/utils/provider-offer-input.util';
import type { ModelCreditQuoteInput } from '@api/helpers/utils/credits/model-credit-quote.util';
import { normalizeModelProviderQuoteRequest } from '@api/helpers/utils/credits/model-provider-quote-request.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  ModelBillablePricingProfile,
  ModelBillableQuoteSnapshot,
  RoutedModelDispatch,
} from '@genfeedai/contracts/interfaces';
import {
  getRuntimeMarginMultiplier,
  quoteModelBillablePricing,
} from '@genfeedai/pricing';
import { platformOrTenantScope } from '@libs/prisma/platform-scope';
import { ServiceUnavailableException } from '@nestjs/common';

export type RoutedPricingProfile = ModelBillablePricingProfile & {
  routedDispatch?: RoutedModelDispatch;
  preparedProviderInput?: Record<string, unknown>;
};

export async function findModelProviderOfferQuote(
  prisma: PrismaService,
  key: string,
  organizationId: string | undefined,
  input: ModelCreditQuoteInput,
): Promise<RoutedPricingProfile | undefined> {
  // tenant-scope-ignore: exact logical catalog key is restricted to this organization or platform rows.
  const model = await prisma.model.findFirst({
    where: { key, isDeleted: false, ...platformOrTenantScope(organizationId) },
    include: {
      providerOffers: {
        include: { executionModel: { include: { providerContracts: true } } },
      },
    },
  });
  if (!model) return undefined;
  if (!model.isActive || model.lifecycle === 'RETIRED') throw unavailable();
  const disabled = new Set(
    (
      await prisma.providerRoutingSetting.findMany({
        where: { isActive: false },
      })
    ).map((setting) => setting.provider),
  );
  if (!model.providerOffers.length) {
    if (
      disabled.has(model.provider) ||
      (model.pinnedProvider && model.provider !== model.pinnedProvider)
    )
      throw unavailable();
    return undefined;
  }
  const candidates: {
    profile: RoutedPricingProfile;
    quote: ModelBillableQuoteSnapshot;
    priority: number;
    id: string;
  }[] = [];
  for (const offer of model.providerOffers) {
    const source = offer.executionModel;
    if (
      ![
        'replicate',
        'fal',
        ...(model.category === 'video' ? ['kie'] : []),
      ].includes(source.provider) ||
      !offer.isActive ||
      disabled.has(source.provider) ||
      !source.isActive ||
      source.isDeleted ||
      (source.organizationId && source.organizationId !== organizationId) ||
      source.category !== model.category ||
      ((input.outputs ?? 1) > 1 &&
        Boolean(source.isBatchSupported) !== Boolean(model.isBatchSupported)) ||
      (model.pinnedProvider && model.pinnedProvider !== source.provider)
    )
      continue;
    const profile = projectModelBillablePricingProfile(
      source,
      source.providerContracts,
    );
    if (!profile.reviewedPricing) continue;
    if (
      source.id !== model.id &&
      profile.reviewedPricing.rates.some(
        (rate) =>
          rate.unit === 'video-token' || rate.unit === 'input-video-token',
      )
    )
      continue;
    const prepared =
      source.id === model.id
        ? input.providerInput
        : mapProviderOfferInput(source.providerInputSchema, input);
    if (prepared === null) continue;
    const request = {
      ...input,
      provider: source.provider,
      providerInput: prepared,
    };
    const priced = quoteModelBillablePricing(
      { ...profile, key },
      normalizeModelProviderQuoteRequest({ ...profile, key }, key, request),
      getRuntimeMarginMultiplier(),
      new Date().toISOString(),
      prepared ? { kind: 'dispatch', input: prepared } : undefined,
    );
    if (priced.status !== 'priced' || priced.snapshot.providerCostUsd === null)
      continue;
    candidates.push({
      id: offer.id,
      priority: offer.priority,
      quote: priced.snapshot,
      profile: {
        ...profile,
        key,
        preparedProviderInput: prepared,
        routedDispatch: {
          offerId: offer.id,
          executionModelKey: source.key,
          endpoint: source.endpoint,
          provider: source.provider,
          schemaFamily: source.providerSchemaFamily,
        },
      },
    });
  }
  candidates.sort(
    (left, right) =>
      (left.quote.providerCostUsd ?? Infinity) -
        (right.quote.providerCostUsd ?? Infinity) ||
      left.priority - right.priority ||
      left.id.localeCompare(right.id),
  );
  if (!candidates[0]) throw unavailable();
  const selected = candidates[0];
  const fallback = candidates.find(
    (candidate) => candidate.profile.provider !== selected.profile.provider,
  );
  if (
    !selected.profile.reviewedPricing?.rates.some(
      (rate) =>
        rate.unit === 'video-token' || rate.unit === 'input-video-token',
    ) &&
    selected.profile.routedDispatch &&
    fallback?.profile.routedDispatch &&
    fallback.quote.providerCostUsd !== null
  ) {
    selected.profile.routedDispatch.fallback = {
      ...fallback.profile.routedDispatch,
      rateVersion: fallback.profile.rateVersion,
      providerCostUsd: fallback.quote.providerCostUsd,
    };
  }
  return selected.profile;
}
function unavailable() {
  return new ServiceUnavailableException({
    code: 'PRICING_UNAVAILABLE',
    message:
      'No active provider offer has reviewed pricing and a compatible input contract',
  });
}
