import { normalizeModelProviderQuoteRequest } from '@api/helpers/utils/credits/model-provider-quote-request.util';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import {
  type StoryboardPreparedMedia,
  storyboardPreparedMediaSchema,
  validateStoryboardPreparedMedia,
} from '@api/helpers/utils/credits/storyboard-prepared-media.schema';
import { workflowFundingFixture } from '@api/helpers/utils/credits/workflow-generation-funding.fixture';
import { projectWorkflowMediaProviderInput } from '@api/helpers/utils/credits/workflow-media-dispatch-input.util';
import { quoteModelBillablePricing } from '@genfeedai/pricing';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

function refingerprint(value: StoryboardPreparedMedia) {
  value.dispatch.billableFingerprint = quoteSnapshotHash({
    ...value.dispatch,
    billableFingerprint: undefined,
  });
}
function fixture(byok = false, free = false): StoryboardPreparedMedia {
  const allocation = workflowFundingFixture().manifest.allocations.find(
    (item) => item.actionId === 'imageGen',
  );
  if (!allocation?.quote) throw new Error('Expected synthetic image fixture');
  const dispatch = structuredClone(allocation.dispatch);
  const input = { prompt: 'A lighthouse', width: 512, height: 512 };
  const projection = projectWorkflowMediaProviderInput(input);
  const profile = { ...allocation.quote.pricingProfile, isFree: free };
  const quote = quoteModelBillablePricing(
    profile,
    normalizeModelProviderQuoteRequest(profile, dispatch.modelKey, {
      ...projection.dimensions,
      requests: 1,
      outputs: 1,
      provider: dispatch.provider,
      providerInput: input,
    }),
    allocation.quote.marginMultiplier,
    allocation.quote.quotedAt,
  );
  if (quote.status !== 'priced') throw new Error(quote.reason);
  dispatch.credentialRoute = byok
    ? { kind: 'byok', credentialId: 'credential-1' }
    : { kind: 'platform' };
  dispatch.projectionPolicy = byok
    ? {
        kind: 'exact-provider-input',
        version: 1,
        inputKeys: projection.inputKeys,
        inputFingerprint: projection.inputFingerprint,
      }
    : { kind: 'frozen-pricing-profile', version: 1 };
  dispatch.quantities = byok
    ? { ...projection.dimensions, requests: 1, outputs: 1 }
    : { ...quote.snapshot.quantities, requests: 1, outputs: 1 };
  const value: StoryboardPreparedMedia = {
    version: 1,
    kind: 'media',
    dispatch,
    quote: byok ? null : quote.snapshot,
    request: { kind: 'exact', providerInput: input },
  };
  refingerprint(value);
  return value;
}
const composed = z.strictObject({ prepared: storyboardPreparedMediaSchema });

describe('frozen exact Storyboard media boundary', () => {
  it('accepts a consistent platform quote and returns a detached input snapshot', () => {
    const value = fixture();
    const parsed = validateStoryboardPreparedMedia(value);
    value.request.providerInput.prompt = 'changed after validation';
    expect(parsed.request.providerInput.prompt).toBe('A lighthouse');
    expect(composed.parse({ prepared: parsed }).prepared).toEqual(parsed);
  });
  it('accepts an explicit-free platform quote without fabricating a positive hold', () => {
    const value = fixture(false, true);
    expect(value.quote?.credits).toBe(0);
    expect(validateStoryboardPreparedMedia(value).quote?.costSource).toBe(
      'explicit-free',
    );
  });
  it('accepts BYOK only with explicit null quote and complete exact input evidence', () => {
    const value = fixture(true);
    expect(composed.parse({ prepared: value }).prepared.quote).toBeNull();
    expect(() =>
      validateStoryboardPreparedMedia({ ...value, quote: undefined }),
    ).toThrow();
    value.request.providerInput.prompt = 'changed';
    expect(() => validateStoryboardPreparedMedia(value)).toThrow();
  });
  it.each(['image-kind', 'model', 'provider', 'target', 'contract'] as const)(
    'rejects changed frozen dispatch relationship %s after recomputing its fingerprint',
    (kind) => {
      const value = fixture();
      if (kind === 'image-kind')
        value.dispatch.preparationContract.brief.mediaKind = 'video';
      if (kind === 'model')
        value.dispatch.preparationContract.brief.modelKey = 'different/model';
      if (kind === 'provider') value.dispatch.provider = 'another-provider';
      if (kind === 'target')
        value.dispatch.target = JSON.stringify({ model: 'different/model' });
      if (kind === 'contract')
        value.dispatch.contractVersion = 'unrelated-contract';
      refingerprint(value);
      expect(() => composed.parse({ prepared: value })).toThrow();
    },
  );
  it('rejects stale dispatch fingerprints', () => {
    const value = fixture();
    value.dispatch.credentialRoute = {
      kind: 'byok',
      credentialId: 'credential-1',
    };
    expect(() => validateStoryboardPreparedMedia(value)).toThrow();
  });
  it('rejects input dimensions differing from the frozen platform quote', () => {
    const value = fixture();
    value.request.providerInput.width = 1024;
    expect(() => validateStoryboardPreparedMedia(value)).toThrow();
  });
  it('rejects changed platform arithmetic even when quote and dispatch quantities still match', () => {
    const value = fixture();
    if (!value.quote) throw new Error('Expected platform quote');
    value.quote.credits += 1;
    value.quote.allocatedCredits = [value.quote.credits];
    expect(() => validateStoryboardPreparedMedia(value)).toThrow();
  });
  it('rejects platform/BYOK route, quote and projection-policy swaps', () => {
    const platform = fixture();
    platform.quote = null;
    expect(() => validateStoryboardPreparedMedia(platform)).toThrow();
    const byok = fixture(true);
    byok.quote = fixture().quote;
    expect(() => validateStoryboardPreparedMedia(byok)).toThrow();
    const wrongPolicy = fixture(true);
    wrongPolicy.dispatch.projectionPolicy = {
      kind: 'frozen-pricing-profile',
      version: 1,
    };
    refingerprint(wrongPolicy);
    expect(() => validateStoryboardPreparedMedia(wrongPolicy)).toThrow();
  });
  it('rejects pricing selectors on a BYOK exact-input dispatch', () => {
    const value = fixture(true);
    value.dispatch.quantities.selectors = {};
    refingerprint(value);
    expect(() => validateStoryboardPreparedMedia(value)).toThrow();
  });
  it.each([undefined, 2, '1'])(
    'requires an exact numeric one at the reviewed output count key (%s)',
    (count) => {
      const value = fixture();
      value.dispatch.preparationContract.reviewedOutput.output = {
        adapterVersion: 1,
        representation: 'uri-array',
        requests: 1,
        outputs: 1,
        countInput: 'num_outputs',
      };
      value.dispatch.contractVersion = `workflow-media-v1:${quoteSnapshotHash(value.dispatch.preparationContract)}`;
      if (count !== undefined) value.request.providerInput.num_outputs = count;
      refingerprint(value);
      expect(() => validateStoryboardPreparedMedia(value)).toThrow();
    },
  );
  it('accepts the frozen reviewed count mapping with exactly one output', () => {
    const value = fixture();
    value.dispatch.preparationContract.reviewedOutput.output = {
      adapterVersion: 1,
      representation: 'uri-array',
      requests: 1,
      outputs: 1,
      countInput: 'num_outputs',
    };
    value.dispatch.contractVersion = `workflow-media-v1:${quoteSnapshotHash(value.dispatch.preparationContract)}`;
    value.request.providerInput.num_outputs = 1;
    refingerprint(value);
    expect(validateStoryboardPreparedMedia(value)).toEqual(value);
  });
  it('rejects nested schema fields that would otherwise be silently stripped', () => {
    const value = fixture();
    Object.defineProperty(value.dispatch.credentialRoute, 'secret', {
      value: 'must-not-drop',
      enumerable: true,
    });
    expect(() => composed.parse({ prepared: value })).toThrow();
    const quote = fixture();
    if (!quote.quote) throw new Error('Expected quote');
    Object.defineProperty(quote.quote, 'unknown', {
      value: true,
      enumerable: true,
    });
    expect(() => validateStoryboardPreparedMedia(quote)).toThrow();
  });
  it('does not invoke getters, serialization hooks or accept noncanonical nested input', () => {
    const value = fixture();
    const getter = vi.fn(() => 'unsafe');
    Object.defineProperty(value.request.providerInput, 'prompt', {
      get: getter,
      enumerable: true,
    });
    expect(() => validateStoryboardPreparedMedia(value)).toThrow();
    expect(getter).not.toHaveBeenCalled();
    const hook = vi.fn(() => fixture());
    expect(() =>
      validateStoryboardPreparedMedia({ ...fixture(), toJSON: hook }),
    ).toThrow();
    expect(hook).not.toHaveBeenCalled();
    for (const invalid of [
      undefined,
      Number.NaN,
      Infinity,
      -0,
      new Date(),
      new Map(),
    ]) {
      const raw = fixture();
      Object.defineProperty(raw.request.providerInput, 'invalid', {
        value: invalid,
        enumerable: true,
      });
      expect(() => validateStoryboardPreparedMedia(raw)).toThrow();
    }
  });
  it('keeps planning templates unresolved without reviewed bound and binding contracts', () => {
    const value = fixture();
    expect(() =>
      composed.parse({
        prepared: {
          ...value,
          request: {
            kind: 'planning-still-template',
            fixedProviderInput: {},
            promptInputKey: 'prompt',
            maximumPromptCharacters: 1000,
          },
        },
      }),
    ).toThrow();
    expect(() =>
      validateStoryboardPreparedMedia({ ...value, kind: 'text' }),
    ).toThrow();
  });
});
