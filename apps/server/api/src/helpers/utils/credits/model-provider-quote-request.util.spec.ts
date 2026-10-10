import { billableProfile } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import { modelBillableQuoteSnapshotSchema } from '@api/helpers/utils/credits/model-billable-quote.schema';
import { normalizeModelProviderQuoteRequest } from '@api/helpers/utils/credits/model-provider-quote-request.util';
import { quoteModelBillablePricing } from '@genfeedai/pricing';
import { describe, expect, it } from 'vitest';

function conditionalProfile() {
  return billableProfile({
    requiredSelectorKeys: ['resolution', 'audio'],
    reviewedPricing: {
      currency: 'USD',
      sourceUrl: 'https://example.test/rates',
      verifiedAt: '2026-09-30T00:00:00.000Z',
      version: 'test-v1',
      reviewStatus: 'approved',
      invariantSelectors: ['quality'],
      rates: [
        {
          component: 'video',
          unit: 'second',
          unitPriceUsd: 0.2,
          when: { resolution: '4k', audio: false },
          isPerOutput: true,
        },
      ],
    },
  });
}
describe('shared provider billable dimension normalization', () => {
  function nativeProfile() {
    return billableProfile({
      provider: 'fal',
      rateVersion: 'test-v1',
      requiredSelectorKeys: ['resolution'],
      reviewedPricing: {
        currency: 'USD',
        reviewStatus: 'approved',
        verifiedAt: '2026-10-10T00:00:00.000Z',
        version: 'test-v1',
        sourceUrl:
          'https://fal.ai/models/bytedance/seedance-2.5/reference-to-video',
        rates: [
          {
            component: 'output',
            unit: 'video-token',
            unitPriceUsd: 0.0000214,
            when: { resolution: '720p' },
          },
          {
            component: 'input',
            unit: 'input-video-token',
            unitPriceUsd: 0.00001284,
            when: { resolution: '720p' },
          },
        ],
      },
    });
  }
  it('derives native Seedance dimensions and fixed frame rate from the final dispatch rather than the client canvas', () => {
    expect(
      normalizeModelProviderQuoteRequest(nativeProfile(), 'test/model', {
        width: 1,
        height: 1,
        framesPerSecond: 1,
        duration: 1,
        inputDuration: 99,
        providerInput: {
          resolution: '720p',
          aspect_ratio: '4:3',
          duration: '8',
          video_urls: [],
        },
      }),
    ).toMatchObject({
      width: 1112,
      height: 834,
      framesPerSecond: 24,
      duration: 8,
      inputDuration: 0,
    });
  });
  it('does not substitute caller samples for automatic provider output size or duration', () => {
    const result = normalizeModelProviderQuoteRequest(
      nativeProfile(),
      'test/model',
      {
        width: 1280,
        height: 720,
        duration: 5,
        providerInput: {
          resolution: '720p',
          aspect_ratio: 'auto',
          duration: 'auto',
        },
      },
    );
    expect(result).not.toHaveProperty('width');
    expect(result).not.toHaveProperty('height');
    expect(result).not.toHaveProperty('duration');
  });
  it('requires resolved input video duration when the prepared dispatch contains reference videos', () => {
    const request = {
      providerInput: {
        resolution: '720p',
        aspect_ratio: '16:9',
        duration: '5',
        video_urls: ['https://cdn.test/reference.mp4'],
      },
    };
    expect(
      normalizeModelProviderQuoteRequest(
        nativeProfile(),
        'test/model',
        request,
      ),
    ).not.toHaveProperty('inputDuration');
    expect(
      normalizeModelProviderQuoteRequest(nativeProfile(), 'test/model', {
        ...request,
        inputDuration: 10,
        referenceEvidenceHash: 'a'.repeat(64),
      }),
    ).toMatchObject({
      inputDuration: 10,
      referenceEvidenceHash: 'a'.repeat(64),
    });
    for (const referenceEvidenceHash of [undefined, 'client-claim']) {
      expect(
        normalizeModelProviderQuoteRequest(nativeProfile(), 'test/model', {
          ...request,
          inputDuration: 10,
          referenceEvidenceHash,
        }),
      ).not.toHaveProperty('inputDuration');
    }
  });
  it('preserves the opaque reference binding through the frozen quote schema', () => {
    const quote = quoteModelBillablePricing(
      nativeProfile(),
      {
        modelKey: 'test/model',
        provider: 'fal',
        width: 1280,
        height: 720,
        duration: 5,
        framesPerSecond: 24,
        inputDuration: 4,
        referenceEvidenceHash: 'a'.repeat(64),
        selectors: { resolution: '720p' },
      },
      1,
      '2026-10-10T01:00:00.000Z',
    );
    if (quote.status !== 'priced') throw new Error(quote.reason);
    const parsed = modelBillableQuoteSnapshotSchema.parse(
      JSON.parse(JSON.stringify(quote.snapshot)),
    );
    expect(parsed.quantities.referenceEvidenceHash).toBe('a'.repeat(64));
    expect(parsed.quantities.inputDuration).toBe(4);
    expect(() =>
      modelBillableQuoteSnapshotSchema.parse({
        ...parsed,
        quantities: {
          ...parsed.quantities,
          referenceEvidenceHash: 'client-claim',
        },
      }),
    ).toThrow();
  });
  it('projects final prepared numeric strings and seconds over supplied estimates', () => {
    expect(
      normalizeModelProviderQuoteRequest(billableProfile(), 'test/model', {
        duration: 2,
        requests: 1,
        outputs: 1,
        organizationId: 'org',
        providerInput: {
          seconds: '6',
          width: '1080',
          height: 1920,
          prompt: 'private prompt',
          api_key: 'fixture-only',
        },
      }),
    ).toEqual({
      modelKey: 'test/model',
      provider: 'replicate',
      duration: 6,
      width: 1080,
      height: 1920,
      requests: 1,
      outputs: 1,
      selectors: {},
    });
  });
  it('uses explicit false audio and the reviewed selector set without retaining unknown fields', () => {
    expect(
      normalizeModelProviderQuoteRequest(conditionalProfile(), 'test/model', {
        selectors: { resolution: '720p', unreviewed: 'excluded' },
        providerInput: {
          resolution: '4k',
          generate_audio: false,
          quality: 'high',
          irrelevant: true,
        },
      }),
    ).toMatchObject({
      selectors: { resolution: '4k', audio: false, quality: 'high' },
    });
    expect(
      normalizeModelProviderQuoteRequest(conditionalProfile(), 'test/model', {
        selectors: { unreviewed: 'excluded' },
      }).selectors,
    ).toEqual({});
  });
  it('keeps future normalization bound to the frozen profile after catalog selector changes', () => {
    const frozen = conditionalProfile();
    const changed = billableProfile({ requiredSelectorKeys: ['mode'] });
    const input = {
      providerInput: { resolution: '4k', generate_audio: false, mode: 'turbo' },
    };
    const original = normalizeModelProviderQuoteRequest(
      frozen,
      'test/model',
      input,
    );
    expect(
      normalizeModelProviderQuoteRequest(changed, 'test/model', input)
        .selectors,
    ).toEqual({ mode: 'turbo' });
    expect(
      normalizeModelProviderQuoteRequest(frozen, 'test/model', input),
    ).toEqual(original);
  });
  it('does not invent absent request counts or duration', () => {
    const normalized = normalizeModelProviderQuoteRequest(
      billableProfile(),
      'test/model',
      {},
    );
    expect(normalized).toEqual({
      modelKey: 'test/model',
      provider: 'replicate',
    });
    expect(normalized).not.toHaveProperty('duration');
    expect(normalized).not.toHaveProperty('outputs');
  });
  it('preserves existing invalid-dimension projection behavior without mutating caller input', () => {
    const input = {
      duration: 2,
      providerInput: { duration: -1, width: Infinity, height: 'NaN' },
    };
    expect(
      normalizeModelProviderQuoteRequest(
        billableProfile(),
        'test/model',
        input,
      ),
    ).toEqual({
      modelKey: 'test/model',
      provider: 'replicate',
      duration: 2,
      selectors: {},
    });
    expect(input).toEqual({
      duration: 2,
      providerInput: { duration: -1, width: Infinity, height: 'NaN' },
    });
  });
  it('retains exact caller model/provider identity and the existing genfeed provider alias', () => {
    expect(
      normalizeModelProviderQuoteRequest(
        billableProfile(),
        'owner/model:version',
        { provider: 'genfeedai' },
      ),
    ).toEqual({
      modelKey: 'owner/model:version',
      provider: 'genfeed-ai',
    });
  });
});
