import type {
  ModelBillablePricingProfile,
  ModelPricingAttention,
  ProviderQuoteDimensions,
  ReviewedProviderRate,
} from '@genfeedai/contracts/interfaces';
import { quoteModelBillablePricing } from './model-billable-quote';
import { DEFAULT_GENERATION_MARGIN_MULTIPLIER } from './plans-pricing';
import { selectorNumber } from './reviewed-provider-pricing';

/** Providers whose rates the daily/weekly watcher refreshes from a machine-readable source. */
const REFRESHED_PROVIDERS: ReadonlySet<string> = new Set(['replicate', 'fal']);
/** A refresh older than this is stale: the watcher runs at least weekly. */
export const MODEL_PRICING_REFRESH_STALE_DAYS = 10;
const DAY_MS = 86_400_000;

export interface ModelPricingAttentionInput {
  category: string;
  /** Sample duration for per-second rates; five seconds when unknown. */
  defaultDuration?: number | null;
  hasTokenPricing?: boolean;
  isActive: boolean;
  isFree: boolean;
  margin?: number | null;
  now: Date;
  profile: ModelBillablePricingProfile;
  provider: string;
  providerPricingSyncedAt?: Date | string | null;
  providerSyncFailureCode?: string | null;
  providerSyncStatus?: string | null;
}

function sampleQuantities(
  defaultDuration: number | null | undefined,
): ProviderQuoteDimensions {
  return {
    characters: 1000,
    duration:
      typeof defaultDuration === 'number' && defaultDuration > 0
        ? defaultDuration
        : 5,
    frames: 24,
    height: 1024,
    inputDuration: 5,
    inputMegapixels: 1,
    inputTokens: 1000,
    outputTokens: 1000,
    references: 1,
    width: 1024,
  };
}

function conflicts(
  left: Record<string, string | number | boolean>,
  right: Record<string, string | number | boolean>,
): boolean {
  return Object.entries(right).some(
    ([key, value]) => key in left && left[key] !== value,
  );
}

/**
 * Every declared selector combination of a reviewed rate sheet. Components
 * that price independently (output and references, say) are merged so each
 * declared variant of one is quoted with a valid variant of the others.
 */
export function enumerateReviewedVariantSelectors(
  rates: readonly ReviewedProviderRate[],
): Array<Record<string, string | number | boolean>> {
  const byComponent = new Map<string, ReviewedProviderRate[]>();
  for (const rate of rates)
    byComponent.set(rate.component, [
      ...(byComponent.get(rate.component) ?? []),
      rate,
    ]);
  const seen = new Set<string>();
  const variants: Array<Record<string, string | number | boolean>> = [];
  for (const [component, componentRates] of byComponent) {
    for (const rate of componentRates) {
      const selectors: Record<string, string | number | boolean> = {
        ...rate.when,
      };
      for (const [otherComponent, others] of byComponent) {
        if (otherComponent === component) continue;
        const compatible = others.find(
          (other) => !conflicts(selectors, other.when),
        );
        if (compatible) Object.assign(selectors, compatible.when);
      }
      const identity = JSON.stringify(
        Object.entries(selectors).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      );
      if (seen.has(identity)) continue;
      seen.add(identity);
      variants.push(selectors);
    }
  }
  return variants.length ? variants : [{}];
}

/**
 * What an operator has to act on for one model. Red means customers cannot be
 * charged correctly (missing, zero or unpriceable); orange means a price still
 * charges but needs a human (a pending provider price change, or a refresh that
 * failed or went stale). Inactive models and explicit free models are never red.
 */
export function classifyModelPricingAttention(
  input: ModelPricingAttentionInput,
): ModelPricingAttention[] {
  // Crun prices through its own provider quote, not a reviewed rate sheet.
  if (!input.isActive || input.provider === 'crun') return [];
  const attention: ModelPricingAttention[] = [];
  const margin =
    typeof input.margin === 'number' &&
    Number.isFinite(input.margin) &&
    input.margin > 0
      ? input.margin
      : DEFAULT_GENERATION_MARGIN_MULTIPLIER;
  const quotedAt = input.now.toISOString();
  const identity = {
    modelKey: input.profile.key,
    provider: input.profile.provider,
  };
  const quantities = sampleQuantities(input.defaultDuration);
  const profile = input.profile;

  if (profile.reviewedPricing) {
    for (const selectors of enumerateReviewedVariantSelectors(
      profile.reviewedPricing.rates,
    )) {
      const quote = quoteModelBillablePricing(
        profile,
        {
          ...identity,
          ...quantities,
          // A duration-priced variant is quoted for its own duration.
          ...(selectorNumber(selectors.duration) !== null
            ? { duration: selectorNumber(selectors.duration) as number }
            : {}),
          ...(Object.keys(selectors).length ? { selectors } : {}),
        },
        margin,
        quotedAt,
      );
      if (quote.status === 'unresolved') {
        attention.push({
          code: 'unpriceable',
          level: 'red',
          reason: quote.reason,
        });
        break;
      }
      if (quote.snapshot.credits === 0 && !input.isFree) {
        attention.push({
          code: 'zero_credits',
          level: 'red',
          reason: 'A priced variant resolves to zero credits',
        });
        break;
      }
    }
  } else if (input.category === 'text' && input.hasTokenPricing) {
    // Text settles on actual token usage from configured per-million rates.
  } else {
    const quote = quoteModelBillablePricing(
      profile,
      { ...identity, ...quantities },
      margin,
      quotedAt,
    );
    if (quote.status === 'unresolved') {
      attention.push({
        code: 'price_missing',
        level: 'red',
        reason: quote.reason,
      });
    } else if (quote.snapshot.credits === 0 && !input.isFree) {
      attention.push({
        code: 'zero_credits',
        level: 'red',
        reason: 'Resolves to zero credits without an explicit free designation',
      });
    }
  }

  if (profile.hasPendingRate)
    attention.push({
      code: 'price_change_pending',
      level: 'orange',
      reason:
        'The provider changed its price; the approved rate keeps charging until an operator approves the new one',
    });
  if (profile.reviewedPricing && input.providerSyncStatus === 'failed')
    attention.push({
      code: 'refresh_failed',
      level: 'orange',
      reason: `The last provider price refresh failed${
        input.providerSyncFailureCode
          ? ` (${input.providerSyncFailureCode})`
          : ''
      }; the last approved rate keeps charging`,
    });
  else if (
    profile.reviewedPricing &&
    REFRESHED_PROVIDERS.has(input.provider) &&
    input.providerPricingSyncedAt
  ) {
    const syncedAt = Date.parse(String(input.providerPricingSyncedAt));
    if (
      Number.isFinite(syncedAt) &&
      input.now.getTime() - syncedAt > MODEL_PRICING_REFRESH_STALE_DAYS * DAY_MS
    )
      attention.push({
        code: 'refresh_stale',
        level: 'orange',
        reason: `The provider price was last refreshed more than ${MODEL_PRICING_REFRESH_STALE_DAYS} days ago`,
      });
  }
  return attention.sort(
    (left, right) =>
      Number(left.level === 'orange') - Number(right.level === 'orange'),
  );
}

/** True when the model must stay out of customer-facing catalogs. */
export function isModelPricingRed(
  attention: readonly ModelPricingAttention[],
): boolean {
  return attention.some((item) => item.level === 'red');
}
