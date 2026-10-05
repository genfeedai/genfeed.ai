import { modelBillableQuoteSnapshotSchema } from '@api/helpers/utils/credits/model-billable-quote.schema';
import { normalizeModelProviderQuoteRequest } from '@api/helpers/utils/credits/model-provider-quote-request.util';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import { workflowGenerationDispatchSchema } from '@api/helpers/utils/credits/workflow-generation-billing.schema';
import {
  assertWorkflowCanonicalJson,
  assertWorkflowMediaPricingUnits,
  projectWorkflowMediaProviderInput,
} from '@api/helpers/utils/credits/workflow-media-dispatch-input.util';
import { quoteModelBillablePricing } from '@genfeedai/pricing';
import { z } from 'zod';

const envelopeSchema = z.strictObject({
  version: z.literal(1),
  kind: z.literal('media'),
  dispatch: workflowGenerationDispatchSchema,
  quote: modelBillableQuoteSnapshotSchema.nullable(),
  request: z.strictObject({
    kind: z.literal('exact'),
    providerInput: z.record(z.string(), z.json()),
  }),
});
export type StoryboardPreparedMedia = z.infer<typeof envelopeSchema>;

function requireMatch(matches: boolean): void {
  if (!matches) throw new Error('Frozen Storyboard media relationships differ');
}
function validateRelationships(value: StoryboardPreparedMedia): void {
  const { dispatch, quote } = value;
  const prepared = dispatch.preparationContract;
  const platform = dispatch.credentialRoute.kind === 'platform';
  requireMatch(platform === (quote !== null));
  requireMatch(
    platform === (dispatch.projectionPolicy.kind === 'frozen-pricing-profile'),
  );
  requireMatch(
    dispatch.provider === 'replicate' &&
      prepared.brief.modelKey === dispatch.modelKey &&
      prepared.reviewedOutput.modelKey === dispatch.modelKey &&
      prepared.brief.mediaKind ===
        (prepared.actionId === 'imageGen' ? 'image' : 'video') &&
      dispatch.target === JSON.stringify(prepared.reviewedOutput.target),
  );
  requireMatch(
    dispatch.contractVersion ===
      `workflow-media-v1:${quoteSnapshotHash(prepared)}` &&
      dispatch.billableFingerprint ===
        quoteSnapshotHash({ ...dispatch, billableFingerprint: undefined }),
  );
  const input = value.request.providerInput;
  const projection = projectWorkflowMediaProviderInput(input);
  const countInput = prepared.reviewedOutput.output.countInput;
  if (countInput !== undefined) requireMatch(input[countInput] === 1);

  if (platform && quote) {
    requireMatch(
      quote.modelKey === dispatch.modelKey &&
        quote.provider === dispatch.provider &&
        quote.pricingProfile.key === dispatch.modelKey &&
        quote.pricingProfile.provider === dispatch.provider &&
        quote.quantities.requests === 1 &&
        quote.quantities.outputs === 1 &&
        quoteSnapshotHash(quote.quantities) ===
          quoteSnapshotHash(dispatch.quantities),
    );
    const {
      modelKey: _modelKey,
      provider: _provider,
      ...quantities
    } = normalizeModelProviderQuoteRequest(
      quote.pricingProfile,
      dispatch.modelKey,
      {
        ...projection.dimensions,
        requests: 1,
        outputs: 1,
        provider: dispatch.provider,
        providerInput: input,
      },
    );
    assertWorkflowMediaPricingUnits(quote.pricingProfile, quantities);
    requireMatch(
      quoteSnapshotHash(quantities) === quoteSnapshotHash(quote.quantities),
    );
    const recomputed = quoteModelBillablePricing(
      quote.pricingProfile,
      { ...quantities, modelKey: quote.modelKey, provider: quote.provider },
      quote.marginMultiplier,
      quote.quotedAt,
      { kind: 'dispatch', input },
    );
    requireMatch(
      recomputed.status === 'priced' &&
        quoteSnapshotHash(recomputed.snapshot) === quoteSnapshotHash(quote),
    );
    return;
  }
  requireMatch(
    quote === null &&
      dispatch.credentialRoute.kind === 'byok' &&
      dispatch.projectionPolicy.kind === 'exact-provider-input',
  );
  if (dispatch.projectionPolicy.kind !== 'exact-provider-input') return;
  requireMatch(
    !Object.hasOwn(dispatch.quantities, 'selectors') &&
      quoteSnapshotHash(dispatch.quantities) ===
        quoteSnapshotHash({
          ...projection.dimensions,
          requests: 1,
          outputs: 1,
        }) &&
      dispatch.projectionPolicy.inputFingerprint ===
        projection.inputFingerprint &&
      quoteSnapshotHash(dispatch.projectionPolicy.inputKeys) ===
        quoteSnapshotHash(projection.inputKeys),
  );
}

/** Frozen consistency only. Catalog approval and line-context authority remain with preparation. */
export const storyboardPreparedMediaSchema = z
  .unknown()
  .transform((value, context) => {
    try {
      assertWorkflowCanonicalJson(value);
      const parsed = envelopeSchema.parse(value);
      requireMatch(quoteSnapshotHash(parsed) === quoteSnapshotHash(value));
      validateRelationships(parsed);
      return structuredClone(parsed);
    } catch {
      context.addIssue({
        code: 'custom',
        message: 'Storyboard exact media preparation is invalid or unresolved',
      });
      return z.NEVER;
    }
  });
export function validateStoryboardPreparedMedia(
  value: unknown,
): StoryboardPreparedMedia {
  return storyboardPreparedMediaSchema.parse(value);
}
