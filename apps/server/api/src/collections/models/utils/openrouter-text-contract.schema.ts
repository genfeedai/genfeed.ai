import { z } from 'zod';

export const OPENROUTER_TEXT_CONTRACT_FAMILY =
  'genfeed.openrouter.text-context-ceiling.v1';
const identity = z
  .string()
  .min(1)
  .refine((value) => value === value.trim());
const positiveInteger = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);
const money = z.number().finite().nonnegative();
export const openrouterTextPricingSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('bounded'),
    version: z.literal(1),
    currency: z.literal('USD'),
    inputUsdPerMillionCeiling: money,
    completionUsdPerMillionCeiling: money,
    requestUsdCeiling: money,
    coverage: z.literal('entire-admitted-context-and-output-range'),
    includesApplicableCacheAndTierCharges: z.literal(true),
    unboundedComponents: z.literal(false),
  }),
  z.strictObject({
    kind: z.literal('explicit-free'),
    version: z.literal(1),
    currency: z.literal('USD'),
    evidence: identity,
  }),
  z.strictObject({
    kind: z.literal('unavailable'),
    version: z.literal(1),
    reason: identity,
  }),
]);
export const openrouterTextSnapshotSchema = z
  .strictObject({
    kind: z.literal('genfeed-model-provider-contract'),
    version: z.literal(1),
    modelId: identity,
    provider: z.literal('openrouter'),
    endpoint: identity,
    schemaFamily: z.literal(OPENROUTER_TEXT_CONTRACT_FAMILY),
    openapiVersion: z.null(),
    openapi: z.strictObject({
      kind: z.literal('genfeed-openrouter-text-contract'),
      version: z.literal(1),
      adapter: z.literal('openrouter-context-ceiling-v1'),
      modelId: identity,
      modelKey: identity,
      catalogProvider: identity,
      transportProvider: z.literal('openrouter'),
      endpointSlug: identity,
      endpointSelection: z.literal('exact'),
      contextLength: positiveInteger,
      maximumCompletionTokens: positiveInteger,
      sourceUrls: z
        .array(z.url().refine((url) => new URL(url).protocol === 'https:'))
        .min(1),
      observedAt: z.iso.datetime(),
    }),
    inputSchema: z.strictObject({
      kind: z.literal('genfeed-openrouter-text-input'),
      version: z.literal(1),
      modalities: z.literal('text-only'),
      messageRoles: z.tuple([z.literal('system'), z.literal('user')]),
      completionCount: z.literal(1),
      outputLimitParameter: z.literal('max_tokens'),
      outputLimitAccounting: z.literal('all-billable-completion-tokens'),
      reasoning: z.enum([
        'not-applicable',
        'disabled',
        'included-in-output-limit',
      ]),
      contextOverflow: z.literal('reject'),
      contextCompression: z.literal('disabled'),
      fallback: z.literal('disabled'),
      optionalChargedFeatures: z.literal('disabled'),
      retention: z.strictObject({
        dataCollection: z.literal('deny'),
        zdr: z.literal(true),
      }),
    }),
    outputSchema: z.strictObject({
      kind: z.literal('genfeed-openrouter-text-output'),
      version: z.literal(1),
      responseModelKey: identity,
      responseKind: z.literal('single-text-completion'),
      tokenAccounting: z.literal('native'),
      costAccounting: z.literal('reported-account-cost-usd'),
    }),
    pricing: openrouterTextPricingSchema,
    currency: z.null(),
    billingUnit: z.null(),
    unitPrice: z.null(),
    unitPriceMicros: z.null(),
    pricingType: z.null(),
    conditionalDimensions: z.strictObject({}),
  })
  .superRefine((snapshot, context) => {
    if (
      snapshot.modelId !== snapshot.openapi.modelId ||
      snapshot.endpoint !== snapshot.openapi.modelKey ||
      snapshot.openapi.maximumCompletionTokens >= snapshot.openapi.contextLength
    )
      context.addIssue({
        code: 'custom',
        message: 'Text contract identity or token bounds disagree',
      });
  });
export const reviewedOpenrouterTextContractSchema = z.strictObject({
  version: z.string().regex(/^[a-f0-9]{64}$/),
  reviewedAt: z.iso.datetime(),
  snapshot: openrouterTextSnapshotSchema,
});
export type OpenRouterTextSnapshot = z.infer<
  typeof openrouterTextSnapshotSchema
>;
export type ReviewedOpenRouterTextContract = z.infer<
  typeof reviewedOpenrouterTextContractSchema
>;
