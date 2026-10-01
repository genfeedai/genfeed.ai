import { billableProfile } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import { normalizeModelProviderQuoteRequest } from '@api/helpers/utils/credits/model-provider-quote-request.util';
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
