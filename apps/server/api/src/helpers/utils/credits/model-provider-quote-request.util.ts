import type { ModelCreditQuoteInput } from '@api/helpers/utils/credits/model-credit-quote.util';
import type {
  ModelBillablePricingProfile,
  ModelBillableQuoteRequest,
} from '@genfeedai/contracts/interfaces';

import { resolveVariantSelectors, variantRuleFields } from '@genfeedai/pricing';

// fal's published Seedance output sizes. Unknown/automatic shapes must not be
// priced using the caller's canvas dimensions.
const SEEDANCE_DIMENSIONS: Readonly<
  Record<string, Readonly<Record<string, readonly [number, number]>>>
> = {
  '480p': {
    '21:9': [992, 432],
    '16:9': [864, 496],
    '4:3': [752, 560],
    '1:1': [640, 640],
    '3:4': [560, 752],
    '9:16': [496, 864],
  },
  '720p': {
    '21:9': [1470, 630],
    '16:9': [1280, 720],
    '4:3': [1112, 834],
    '1:1': [960, 960],
    '3:4': [834, 1112],
    '9:16': [720, 1280],
  },
  '1080p': { '16:9': [1920, 1080] },
};

/** Shared price-relevant input projection; runtime validation supplies its frozen pricing profile. */
export function normalizeModelProviderQuoteRequest(
  profile: ModelBillablePricingProfile,
  modelKey: string,
  input: ModelCreditQuoteInput,
): ModelBillableQuoteRequest {
  const {
    organizationId: _organizationId,
    providerInput,
    provider,
    ...quantities
  } = input;
  const selectorKeys = new Set([
    ...profile.requiredSelectorKeys,
    ...(profile.reviewedPricing?.invariantSelectors ?? []),
    ...(profile.reviewedPricing?.rates.flatMap((rate) =>
      Object.keys(rate.when),
    ) ?? []),
  ]);
  if (profile.reviewedPricing) {
    quantities.selectors = Object.fromEntries(
      Object.entries(quantities.selectors ?? {}).filter(([key]) =>
        selectorKeys.has(key),
      ),
    );
  }
  if (providerInput) {
    const rules = profile.reviewedPricing?.variantRules;
    const ruleKeys = new Set(rules?.map((rule) => rule.selectorKey) ?? []);
    const ruleFields = variantRuleFields(rules ?? []);
    for (const key of ruleFields) {
      if (!ruleKeys.has(key) && quantities.selectors)
        delete quantities.selectors[key];
    }
    const resolved = rules
      ? resolveVariantSelectors(
          rules,
          { kind: 'dispatch', input: providerInput },
          quantities.selectors,
        )
      : undefined;
    const selectors =
      resolved?.status === 'ok'
        ? { ...resolved.selectors }
        : { ...quantities.selectors };
    for (const key of selectorKeys) {
      if (ruleKeys.has(key) || ruleFields.has(key)) continue;
      const value =
        providerInput[key] ??
        (key === 'audio'
          ? providerInput.generate_audio
          : key === 'generate_audio'
            ? providerInput.audio
            : undefined);
      if (
        typeof value === 'string' ||
        typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value))
      )
        selectors[key] = value;
    }
    quantities.selectors = selectors;
    for (const key of ['duration', 'height', 'width'] as const) {
      const value =
        providerInput[key] ??
        (key === 'duration' ? providerInput.seconds : undefined);
      const number =
        typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value)
          ? Number(value)
          : value;
      if (typeof number === 'number' && Number.isFinite(number) && number > 0)
        quantities[key] = number;
    }
  }
  const nativeVideoRates =
    profile.reviewedPricing?.rates.filter(
      (rate) =>
        rate.unit === 'video-token' || rate.unit === 'input-video-token',
    ) ?? [];
  if (nativeVideoRates.length && profile.provider === 'fal') {
    // Quantity evidence comes from the prepared request, never the UI estimate.
    delete quantities.width;
    delete quantities.height;
    delete quantities.duration;
    delete quantities.framesPerSecond;
    const source = profile.reviewedPricing?.sourceUrl ?? '';
    if (
      /^https:\/\/fal\.ai\/models\/(?:bytedance\/seedance-2\.[05](?:\/(?:fast|mini|us))?|fal-ai\/bytedance\/seedance\/v1(?:\.5)?\/pro(?:\/fast)?)\/(?:text-to-video|image-to-video|reference-to-video)$/.test(
        source,
      ) &&
      providerInput
    ) {
      const resolution = providerInput.resolution;
      const aspect = providerInput.aspect_ratio;
      const dimensions =
        typeof resolution === 'string' && typeof aspect === 'string'
          ? SEEDANCE_DIMENSIONS[resolution]?.[aspect]
          : undefined;
      if (dimensions) [quantities.width, quantities.height] = dimensions;
      const seconds =
        typeof providerInput.duration === 'string' &&
        /^\d+$/.test(providerInput.duration)
          ? Number(providerInput.duration)
          : providerInput.duration;
      if (
        typeof seconds === 'number' &&
        Number.isFinite(seconds) &&
        seconds > 0
      )
        quantities.duration = seconds;
      quantities.framesPerSecond = 24;
    }
    if (nativeVideoRates.some((rate) => rate.unit === 'input-video-token')) {
      const videos = providerInput?.video_urls;
      if (
        videos === undefined ||
        (Array.isArray(videos) && videos.length === 0)
      )
        quantities.inputDuration = 0;
      else if (
        !Array.isArray(videos) ||
        !Number.isFinite(quantities.inputDuration) ||
        (quantities.inputDuration ?? 0) <= 0
      )
        delete quantities.inputDuration;
    }
  }
  return {
    ...quantities,
    modelKey,
    provider:
      provider === 'genfeedai' ? 'genfeed-ai' : (provider ?? profile.provider),
  };
}
