import { billableProfile } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import {
  assertWorkflowMediaPricingUnits,
  projectWorkflowMediaProviderInput as project,
} from '@api/helpers/utils/credits/workflow-media-dispatch-input.util';
import { describe, expect, it } from 'vitest';

const failure = expect.objectContaining({
  response: expect.objectContaining({ detail: expect.any(String) }),
});
describe('workflow actual provider input evidence', () => {
  it('pins the entire JSON request regardless of insertion order without storing its prompt', () => {
    const first = project({
      prompt: 'private text',
      nested: { mode: false, quality: 0 },
      duration: '8',
      width: 1024,
      height: 1024,
    });
    const reordered = project({
      height: 1024,
      width: 1024,
      duration: '8',
      nested: { quality: 0, mode: false },
      prompt: 'private text',
    });
    expect(first).toEqual(reordered);
    expect(first.dimensions).toEqual({
      duration: 8,
      width: 1024,
      height: 1024,
    });
    expect(first).not.toHaveProperty('prompt');
    expect(project({ prompt: 'changed' }).inputFingerprint).not.toBe(
      project({ prompt: 'private text' }).inputFingerprint,
    );
  });
  it.each([
    -1,
    0,
    null,
    true,
    '-1',
    '8s',
    ' 8',
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])(
    'rejects actual duration %s rather than using a node fallback',
    (duration) => {
      expect(() => project({ duration })).toThrow(failure);
      expect(() => project({ seconds: duration })).toThrow(failure);
    },
  );
  it('requires both time aliases to agree and preserves valid false/zero selectors', () => {
    expect(
      project({
        duration: 8,
        seconds: '8.0',
        audio: false,
        generate_audio: false,
        quality: 0,
      }).dimensions,
    ).toEqual({ duration: 8 });
    expect(() => project({ duration: 8, seconds: 9 })).toThrow(failure);
    expect(() => project({ audio: false, generate_audio: true })).toThrow(
      failure,
    );
    expect(project({ prompt: 'only prompt' }).dimensions).toEqual({});
  });
  it.each([0, -1, 12.5, null, '1e3', Number.POSITIVE_INFINITY])(
    'requires positive integral dimensions %s',
    (width) => {
      expect(() => project({ width })).toThrow(failure);
    },
  );
  it.each([
    undefined,
    () => 1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    new Date(),
    new Map(),
    1n,
    -0,
  ])('rejects values without unambiguous JSON serialization %#', (value) => {
    expect(() => project({ nested: { value } })).toThrow(failure);
  });
  it('rejects cycles, getters, hidden/symbol properties, sparse arrays and non-JSON array keys', () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const getter = Object.defineProperty({}, 'value', {
      enumerable: true,
      get: () => 1,
    });
    const hidden = Object.defineProperty({}, 'value', { value: 1 });
    const symbols = { [Symbol('value')]: 1 };
    const sparse = Array(2);
    const keyed = Object.assign([1], { extra: 1 });
    for (const value of [cycle, getter, hidden, symbols, sparse, keyed])
      expect(() => project({ value })).toThrow(failure);
  });
  it('rejects array subclasses and inherited hashing or serialization hooks', () => {
    class CustomArray extends Array<number> {}
    const inheritedMap = [1, 2];
    Object.setPrototypeOf(inheritedMap, {
      ...Array.prototype,
      map: () => [],
    });
    const inheritedJson = [1, 2];
    Object.setPrototypeOf(inheritedJson, {
      ...Array.prototype,
      toJSON: () => [],
    });
    const ownJson = Object.assign([1, 2], { toJSON: () => [] });
    for (const value of [
      new CustomArray(1, 2),
      inheritedMap,
      inheritedJson,
      ownJson,
    ])
      expect(() => project({ value })).toThrow(failure);
    expect(project({ value: [1, 2] }).inputFingerprint).not.toBe(
      project({ value: [2, 1] }).inputFingerprint,
    );
  });
  it('accepts request pricing without dimensions and requires actual dimensions for metered units', () => {
    expect(() =>
      assertWorkflowMediaPricingUnits(billableProfile(), {
        requests: 1,
        outputs: 1,
      }),
    ).not.toThrow();
    expect(() =>
      assertWorkflowMediaPricingUnits(
        billableProfile({ pricingType: 'per-second' }),
        {},
      ),
    ).toThrow(failure);
    expect(() =>
      assertWorkflowMediaPricingUnits(
        billableProfile({ pricingType: 'per-megapixel' }),
        { width: 1024 },
      ),
    ).toThrow(failure);
    expect(() =>
      assertWorkflowMediaPricingUnits(
        billableProfile({ pricingType: 'per-megapixel' }),
        { width: 1024, height: 1024 },
      ),
    ).not.toThrow();
  });
  it.each([
    'input-second',
    'input-megapixel',
    'frame',
    'input-token',
    'output-token',
    'character',
    'reference',
  ] as const)('requires a prepared evidence adapter for %s pricing', (unit) => {
    const profile = billableProfile({
      reviewedPricing: {
        currency: 'USD',
        reviewStatus: 'approved',
        sourceUrl: 'https://test.invalid',
        verifiedAt: '2026-09-30T00:00:00Z',
        rates: [{ unit, component: 'test', when: {}, unitPriceUsd: 1 }],
      },
    });
    expect(() => assertWorkflowMediaPricingUnits(profile, {})).toThrow(failure);
  });
});
