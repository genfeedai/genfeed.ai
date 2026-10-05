import type { ReviewedProviderRate } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import {
  describeProviderRateChanges,
  hashReviewedProviderRates,
  sha256Hex,
} from './reviewed-rate-hash';

const first: ReviewedProviderRate = {
  component: 'video_output_count',
  unit: 'output',
  unitPriceUsd: 0.19,
  when: { resolution: '768P', duration: 6 },
};
const second: ReviewedProviderRate = {
  component: 'video_output_count',
  unit: 'output',
  unitPriceUsd: 0.32,
  when: { resolution: '768P', duration: 10 },
};
const rates = [first, second];

describe('sha256Hex', () => {
  it('matches the published SHA-256 test vectors', () => {
    expect(sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(
      sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
    ).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });
});

describe('hashReviewedProviderRates', () => {
  it('is stable over rate order and selector key order', () => {
    const shuffled: ReviewedProviderRate[] = [
      { ...second, when: { duration: 10, resolution: '768P' } },
      { ...first, when: { duration: 6, resolution: '768P' } },
    ];
    expect(hashReviewedProviderRates(shuffled)).toBe(
      hashReviewedProviderRates(rates),
    );
  });

  it('treats absent optional fields as their defaults', () => {
    const explicit = rates.map((rate) => ({
      ...rate,
      includedUnits: 0,
      isPerOutput: false,
      minimumUnits: 0,
      roundUnitsTo: 0,
    }));
    expect(hashReviewedProviderRates(explicit)).toBe(
      hashReviewedProviderRates(rates),
    );
  });

  it('changes when a price, selector or unit changes', () => {
    const base = hashReviewedProviderRates(rates);
    expect(
      hashReviewedProviderRates([{ ...first, unitPriceUsd: 0.2 }, second]),
    ).not.toBe(base);
    expect(
      hashReviewedProviderRates([
        { ...first, when: { resolution: '1080P', duration: 6 } },
        second,
      ]),
    ).not.toBe(base);
    expect(
      hashReviewedProviderRates([{ ...first, unit: 'request' }, second]),
    ).not.toBe(base);
  });
});

describe('describeProviderRateChanges', () => {
  it('reports changed, added and removed variants only', () => {
    const added: ReviewedProviderRate = {
      ...first,
      unitPriceUsd: 0.33,
      when: { resolution: '1080P', duration: 6 },
    };
    expect(
      describeProviderRateChanges(rates, [
        { ...first, unitPriceUsd: 0.21 },
        added,
      ]),
    ).toEqual([
      {
        component: 'video_output_count',
        newPriceUsd: 0.21,
        oldPriceUsd: 0.19,
        unit: 'output',
        variant: 'duration=6 · resolution=768P',
      },
      {
        component: 'video_output_count',
        newPriceUsd: 0.33,
        oldPriceUsd: null,
        unit: 'output',
        variant: 'duration=6 · resolution=1080P',
      },
      {
        component: 'video_output_count',
        newPriceUsd: null,
        oldPriceUsd: 0.32,
        unit: 'output',
        variant: 'duration=10 · resolution=768P',
      },
    ]);
    expect(describeProviderRateChanges(rates, [...rates])).toEqual([]);
  });
});
