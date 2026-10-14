import { billableProfile } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import { MODEL_KEYS, SELF_HOSTED_MODELS } from '@genfeedai/contracts/constants';
import type {
  ModelBillablePricingProfile,
  ModelBillableQuoteSnapshot,
} from '@genfeedai/contracts/interfaces';
import {
  quoteModelBillablePricing,
  REVIEWED_RATE_SHEET_ENTRIES,
} from '@genfeedai/pricing';

export const AVATAR_QUOTED_AT = '2026-10-14T00:00:00.000Z';

/** The reviewed HeyGen avatar engine tariff exactly as the rate sheet seeds it. */
export function avatarEngineProfile(
  endpoint: 'heygen/avatar-iv' | 'heygen/avatar-v',
): ModelBillablePricingProfile {
  const entry = REVIEWED_RATE_SHEET_ENTRIES.find(
    (candidate) => candidate.endpoint === endpoint,
  );
  if (!entry) throw new Error(`The rate sheet must carry ${endpoint}`);
  return billableProfile({
    cost: 0,
    key: endpoint,
    provider: 'heygen',
    rateVersion: 'rate-v1',
    requiresReviewedRates: true,
    reviewedPricing: {
      currency: 'USD',
      rates: [...entry.rates],
      reviewStatus: 'approved',
      sourceUrl: entry.sourceUrl,
      verifiedAt: entry.verifiedAt,
      version: 'rate-v1',
    },
  });
}

/** A priced admission snapshot for one avatar render at the given seconds. */
export function avatarEngineSnapshot(
  endpoint: 'heygen/avatar-iv' | 'heygen/avatar-v',
  avatarType: string,
  seconds: number,
  marginMultiplier = 3.33,
): ModelBillableQuoteSnapshot {
  const quote = quoteModelBillablePricing(
    avatarEngineProfile(endpoint),
    {
      duration: seconds,
      modelKey: endpoint,
      provider: 'heygen',
      selectors: { avatar_type: avatarType },
    },
    marginMultiplier,
    AVATAR_QUOTED_AT,
  );
  if (quote.status !== 'priced') throw new Error(quote.reason);
  return quote.snapshot;
}

/**
 * The `heygen/avatar` photo-animation row exactly as the curated catalog seeds
 * it: no reviewed rate, priced from its configured per-second provider cost.
 */
export function photoAnimationProfile(): ModelBillablePricingProfile {
  const row = SELF_HOSTED_MODELS.find(
    (model) => model.key === MODEL_KEYS.HEYGEN_AVATAR,
  );
  if (!row) throw new Error('The catalog must curate heygen/avatar');
  return billableProfile({
    cost: row.cost,
    key: row.key,
    pricingType: 'pricingType' in row ? (row.pricingType ?? null) : null,
    provider: row.provider,
    providerCostUsd: row.providerCostUsd,
  });
}

/** A priced photo-animation admission snapshot at the given seconds. */
export function photoAnimationSnapshot(
  seconds: number,
  marginMultiplier = 3.33,
): ModelBillableQuoteSnapshot {
  const quote = quoteModelBillablePricing(
    photoAnimationProfile(),
    {
      duration: seconds,
      modelKey: MODEL_KEYS.HEYGEN_AVATAR,
      provider: 'heygen',
    },
    marginMultiplier,
    AVATAR_QUOTED_AT,
  );
  if (quote.status !== 'priced') throw new Error(quote.reason);
  return quote.snapshot;
}
