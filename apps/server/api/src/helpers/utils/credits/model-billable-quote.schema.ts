import { z } from 'zod';

const selectors = z.record(
  z.string(),
  z.union([z.string(), z.number().finite(), z.boolean()]),
);
const quantities = z.object({
  requests: z.number().int().positive().optional(),
  outputs: z.number().int().positive().optional(),
  duration: z.number().positive().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  inputDuration: z.number().nonnegative().optional(),
  inputMegapixels: z.number().nonnegative().optional(),
  frames: z.number().nonnegative().optional(),
  inputTokens: z.number().nonnegative().optional(),
  outputTokens: z.number().nonnegative().optional(),
  characters: z.number().nonnegative().optional(),
  references: z.number().nonnegative().optional(),
  selectors: selectors.optional(),
});
const rate = z.object({
  component: z.string(),
  unit: z.enum([
    'request',
    'output',
    'second',
    'input-second',
    'megapixel',
    'input-megapixel',
    'frame',
    'input-token',
    'output-token',
    'character',
    'reference',
  ]),
  unitPriceUsd: z.number().finite().nonnegative(),
  when: selectors,
  isPerOutput: z.boolean().optional(),
  includedUnits: z.number().nonnegative().optional(),
  minimumUnits: z.number().nonnegative().optional(),
  roundUnitsTo: z.number().nonnegative().optional(),
});
const profile = z.object({
  key: z.string().min(1),
  provider: z.string().min(1),
  isActive: z.boolean(),
  isDeleted: z.boolean(),
  isFree: z.boolean(),
  pricingType: z.string().nullable(),
  providerCostUsd: z.number().finite().nullable(),
  cost: z.number().finite(),
  costPerUnit: z.number().finite().nullable(),
  minCost: z.number().finite().nullable(),
  reviewedPricing: z
    .object({
      version: z.string().optional(),
      invariantSelectors: z.array(z.string()).optional(),
      currency: z.string(),
      sourceUrl: z.string(),
      verifiedAt: z.string(),
      reviewStatus: z.string(),
      isFree: z.boolean().optional(),
      rates: z.array(rate),
    })
    .nullable(),
  rateVersion: z.string().nullable(),
  hasPendingRate: z.boolean(),
  requiresReviewedRates: z.boolean(),
  requiredSelectorKeys: z.array(z.string()),
  requestCompletionPolicy: z
    .enum(['successful-request', 'fractional-subsidy'])
    .optional(),
});

export const crunProviderQuoteSnapshotSchema = z
  .object({
    provider: z.literal('crun'),
    estimated: z.literal(false),
    providerCreditsPerTask: z.string().regex(/^\d+(?:\.\d+)?$/),
    quoteHash: z.string().regex(/^[a-f0-9]{64}$/),
    inputHash: z.string().regex(/^[a-f0-9]{64}$/),
    contractVersion: z.string().min(1).max(128),
    creditsPerUsd: z
      .string()
      .regex(/^\d+(?:\.\d+)?$/)
      .refine((value) => Number.isFinite(Number(value)) && Number(value) > 0)
      .nullable(),
    acquisitionRateVersion: z.string().min(1).nullable(),
    credentialSource: z.enum(['hosted', 'byok']),
    credentialId: z.string().min(1).nullable(),
    credentialFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .superRefine((value, context) => {
    const valid =
      value.credentialSource === 'byok'
        ? value.creditsPerUsd === null &&
          value.acquisitionRateVersion === null &&
          value.credentialId === null
        : value.creditsPerUsd !== null &&
          value.acquisitionRateVersion !== null &&
          value.credentialId === null;
    if (!valid)
      context.addIssue({
        code: 'custom',
        message: 'Frozen Crun credential/rate source is inconsistent',
      });
  });

export const modelBillableQuoteSnapshotSchema = z.object({
  modelKey: z.string().min(1),
  provider: z.string().min(1),
  rateVersion: z.string().nullable(),
  quotedAt: z.iso.datetime(),
  marginMultiplier: z.number().finite().positive().nullable(),
  quantities,
  costSource: z.enum([
    'reviewed-provider',
    'configured-provider',
    'legacy-credits',
    'explicit-free',
  ]),
  providerCostUsd: z.number().finite().nonnegative().nullable(),
  credits: z.number().int().nonnegative(),
  allocationBasis: z.enum(['request', 'output']),
  allocatedCredits: z.array(z.number().int().nonnegative()),
  pricingProfile: profile,
  providerQuote: crunProviderQuoteSnapshotSchema.optional(),
});
