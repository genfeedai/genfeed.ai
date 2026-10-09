import type {
  ReviewedProviderRate,
  ReviewedVariantRule,
} from '@genfeedai/contracts/interfaces';
import { multiplyDecimalPricing } from '@genfeedai/pricing/decimal-pricing';
import type { NormalizedFalPrice } from '@workers/crons/fal-model-watcher/fal-pricing';

export interface FalSeedancePricingSnapshot {
  currency: 'USD';
  invariantSelectors: string[];
  rates: ReviewedProviderRate[];
  rawPrices: NormalizedFalPrice[];
  source: 'fal-seedance-token-tariff';
  sourceUrl: string;
  verifiedAt: string;
  variantRules?: ReviewedVariantRule[];
}

interface SeedanceTokenTerms {
  base: number;
  denominator: number;
  resolutionRates: Record<string, number>;
  audioRates?: boolean;
  inputOnlyDiscount?: boolean;
}

// These are provider token tariffs, not the approximate per-second examples.
// API observations must still match the dated base below; a changed observation
// cannot silently re-verify these reviewed conditional terms.
const TERMS_VERIFIED_AT = '2026-10-09T22:07:02.989Z';
const TERMS: Readonly<Record<string, SeedanceTokenTerms>> = {
  'bytedance/seedance-2.0': {
    base: 0.014,
    denominator: 1000,
    resolutionRates: {
      '480p': 0.014,
      '720p': 0.014,
      '1080p': 0.014,
      '4k': 0.008,
    },
  },
  'bytedance/seedance-2.0/fast': {
    base: 0.0112,
    denominator: 1000,
    resolutionRates: { '480p': 0.0112, '720p': 0.0112 },
  },
  'bytedance/seedance-2.0/mini': {
    base: 0.007,
    denominator: 1000,
    resolutionRates: { '480p': 0.007, '720p': 0.007 },
    inputOnlyDiscount: true,
  },
  // The US page verifies only 480p/720p. Other schema choices remain unpriced.
  'bytedance/seedance-2.0/us': {
    base: 0.0168,
    denominator: 1000,
    resolutionRates: { '480p': 0.0168, '720p': 0.0168 },
  },
  'bytedance/seedance-2.5': {
    base: 0.0214,
    denominator: 1000,
    resolutionRates: { '480p': 0.0214, '720p': 0.0214, '1080p': 0.0234 },
  },
  'bytedance/seedance-2.5/us': {
    base: 0.02568,
    denominator: 1000,
    resolutionRates: { '480p': 0.02568, '720p': 0.02568, '1080p': 0.02808 },
  },
  'fal-ai/bytedance/seedance/v1/pro': {
    base: 2.5,
    denominator: 1000000,
    resolutionRates: { '480p': 2.5, '720p': 2.5, '1080p': 2.5 },
  },
  'fal-ai/bytedance/seedance/v1/pro/fast': {
    base: 1,
    denominator: 1000000,
    resolutionRates: { '480p': 1, '720p': 1, '1080p': 1 },
  },
  'fal-ai/bytedance/seedance/v1.5/pro': {
    base: 1.2,
    denominator: 1000000,
    resolutionRates: { '480p': 1.2, '720p': 1.2, '1080p': 1.2 },
    audioRates: true,
  },
};

export function observeFalSeedancePricing(
  endpoint: string,
  prices: NormalizedFalPrice[],
): FalSeedancePricingSnapshot | null {
  const split = endpoint.lastIndexOf('/');
  const family = endpoint.slice(0, split);
  const mode = endpoint.slice(split + 1);
  const terms = TERMS[family];
  if (
    !terms ||
    !['text-to-video', 'image-to-video', 'reference-to-video'].includes(mode)
  )
    return null;
  const price = prices.length === 1 ? prices[0] : undefined;
  if (
    price?.currency !== 'USD' ||
    price.endpoint !== endpoint ||
    Object.keys(price.conditionalDimensions).length ||
    Number(price.unitPrice) !== terms.base ||
    price.unit.toLowerCase().replaceAll(/[-\s]+/g, '_') !==
      (terms.denominator === 1000 ? '1000_tokens' : '1m_tokens')
  )
    return null;

  const reference = mode === 'reference-to-video';
  const wholeDiscount = reference && !terms.inputOnlyDiscount;
  const rates: ReviewedProviderRate[] = [];
  for (const [resolution, tariff] of Object.entries(terms.resolutionRates)) {
    for (const generateAudio of terms.audioRates
      ? [false, true]
      : [undefined]) {
      for (const hasVideoInput of wholeDiscount ? [false, true] : [undefined]) {
        const when = {
          resolution,
          ...(generateAudio !== undefined
            ? { generate_audio: generateAudio }
            : {}),
          ...(hasVideoInput !== undefined
            ? { has_video_input: hasVideoInput }
            : {}),
        };
        const unitPrice = multiplyDecimalPricing(
          tariff,
          1 / terms.denominator,
          generateAudio ? 2 : 1,
        );
        rates.push({
          component: 'output',
          unit: 'video-token',
          unitPriceUsd: multiplyDecimalPricing(
            unitPrice,
            hasVideoInput ? 0.6 : 1,
          ),
          when,
          isPerOutput: true,
        });
        if (reference)
          rates.push({
            component: 'reference-video',
            unit: 'input-video-token',
            unitPriceUsd: multiplyDecimalPricing(
              unitPrice,
              terms.inputOnlyDiscount || hasVideoInput ? 0.6 : 1,
            ),
            when,
            isPerOutput: true,
          });
      }
    }
  }
  return {
    currency: 'USD',
    invariantSelectors: terms.audioRates ? [] : ['generate_audio'],
    rates,
    rawPrices: prices,
    source: 'fal-seedance-token-tariff',
    sourceUrl: `https://fal.ai/models/${endpoint}`,
    verifiedAt: TERMS_VERIFIED_AT,
    ...(wholeDiscount
      ? {
          variantRules: [
            {
              criterionTitle: 'Video references',
              selectorKey: 'has_video_input',
              derive: {
                kind: 'presence',
                field: 'video_urls',
                fieldType: 'array',
                whenPresent: true,
                whenAbsent: false,
              },
            },
          ],
        }
      : {}),
  };
}
