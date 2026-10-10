import { Platform } from '@genfeedai/contracts';
import type {
  BreakoutBaselineInput,
  BreakoutObservation,
  BreakoutObservationScope,
} from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import { evaluateComparableBreakout } from './breakout-baseline.helper';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 9, 8, 12);
const SCOPE: BreakoutObservationScope = {
  organizationId: 'org-a',
  brandId: 'brand-a',
  credentialId: 'credential-a',
  platform: Platform.TWITTER,
  format: 'text',
};
function observation(
  id: string,
  publishedAtMs: number,
  value = 100,
): BreakoutObservation {
  return {
    ...SCOPE,
    id,
    logicalPostId: `publication-${id}`,
    sourceFingerprint: `fingerprint-${id}`,
    contentDigest: `digest-${id}`,
    publishedAtMs,
    requestStartedAtMs: publishedAtMs + HOUR,
    receivedAtMs: publishedAtMs + HOUR + 1000,
    providerAsOfMs: null,
    exposures: {
      impressions: {
        availability: 'observed',
        value,
        source: 'organic_metrics.impression_count',
        scope: 'organic',
      },
    },
    isDeleted: false,
    isPinned: false,
    isPromoted: false,
    isResponse: false,
    sourceValid: true,
  };
}
function fixture(): BreakoutBaselineInput {
  return {
    scope: SCOPE,
    nowMs: NOW,
    metric: 'impressions',
    target: observation('target', NOW - HOUR - 1000, 1000),
    observations: Array.from({ length: 5 }, (_, index) =>
      observation(`prior-${index}`, NOW - (index + 1) * DAY),
    ),
    options: {
      windowAgeMs: HOUR,
      toleranceMs: 10 * 60_000,
      windowSize: 20,
      minimumSampleSize: 5,
      breakoutThreshold: 10,
    },
    truncated: false,
  };
}
function replaceMetric(row: BreakoutObservation, value: number | null) {
  row.exposures.impressions = {
    availability: 'observed',
    value,
    source: 'organic_metrics.impression_count',
    scope: 'organic',
  };
}

describe('prospective comparable breakout evidence', () => {
  it('rejects an unnamed target observation and an overflowing age window', () => {
    const input = fixture();
    expect(
      evaluateComparableBreakout({
        ...input,
        target: { ...input.target, id: '' },
      }).status,
    ).toBe('invalid_target');
    expect(() =>
      evaluateComparableBreakout({
        ...input,
        options: {
          ...input.options,
          windowAgeMs: Number.MAX_SAFE_INTEGER,
          toleranceMs: 1,
        },
      }),
    ).toThrow(RangeError);
  });
  it('retains five distinct same-age contributors for an exact tenfold signal', () => {
    const input = fixture();
    const original = structuredClone(input);
    const result = evaluateComparableBreakout(input);
    expect(result).toMatchObject({
      version: 1,
      status: 'breakout',
      metric: 'impressions',
      targetValue: 1000,
      median: 100,
      ratio: 10,
      sampleSize: 5,
      timeBasis: 'collection_interval',
    });
    expect(result.contributors.map((row) => row.sourceFingerprint)).toEqual(
      input.observations.map((row) => row.sourceFingerprint),
    );
    expect(input).toEqual(original);
  });
  it('reports a ratio below ten without authorizing a breakout', () => {
    const input = fixture();
    const target = structuredClone(input.target);
    replaceMetric(target, 999);
    expect(evaluateComparableBreakout({ ...input, target })).toMatchObject({
      status: 'below_threshold',
      ratio: 9.99,
    });
  });
  it('keeps observed zero separate from missing exposure', () => {
    const input = fixture();
    const target: Mutable<BreakoutObservation> = structuredClone(input.target);
    replaceMetric(target, 0);
    expect(evaluateComparableBreakout({ ...input, target })).toMatchObject({
      status: 'below_threshold',
      targetValue: 0,
      ratio: 0,
    });
    target.exposures = {};
    const unavailable = evaluateComparableBreakout({ ...input, target });
    expect(unavailable.status).toBe('invalid_target');
    expect(unavailable.exclusions[0].reasons).toContain('unavailable_metric');
  });
  it('withholds the ratio when the comparable median is zero', () => {
    const input = fixture();
    const observations = input.observations.map((row) => {
      const zero = structuredClone(row);
      replaceMetric(zero, 0);
      return zero;
    });
    expect(
      evaluateComparableBreakout({ ...input, observations }),
    ).toMatchObject({
      status: 'zero_baseline',
      median: 0,
      ratio: null,
      sampleSize: 5,
    });
  });
  it.each([
    'organizationId',
    'brandId',
    'credentialId',
    'platform',
    'format',
  ] as const)('excludes a foreign %s', (key) => {
    const input = fixture();
    const row: Mutable<BreakoutObservation> = structuredClone(
      input.observations[0],
    );
    if (key === 'platform') row.platform = Platform.INSTAGRAM;
    else if (key === 'format') row.format = 'video';
    else row[key] = 'other';
    const result = evaluateComparableBreakout({
      ...input,
      observations: [row, ...input.observations.slice(1)],
    });
    expect(result).toMatchObject({
      status: 'insufficient_data',
      sampleSize: 4,
      ratio: null,
    });
    expect(result.exclusions[0].reasons).toContain('foreign_scope');
    expect(evaluateComparableBreakout({ ...input, target: row }).status).toBe(
      'invalid_target',
    );
  });
  it.each([
    null,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])('excludes an invalid observed count %s', (value) => {
    const input = fixture();
    const target = structuredClone(input.target);
    replaceMetric(target, value);
    const result = evaluateComparableBreakout({ ...input, target });
    expect(result.status).toBe('invalid_target');
    expect(result.exclusions[0].reasons).toContain('invalid_metric');
  });
  it.each(['isDeleted', 'isPinned', 'isResponse'] as const)(
    'excludes %s evidence',
    (flag) => {
      const input = fixture();
      const target = { ...input.target, [flag]: true };
      expect(evaluateComparableBreakout({ ...input, target }).status).toBe(
        'invalid_target',
      );
    },
  );
  it('retains unknown flags without converting them to false', () => {
    const input = fixture();
    const observations = input.observations.map((row) => ({
      ...row,
      isPinned: null,
      isPromoted: null,
    }));
    const result = evaluateComparableBreakout({ ...input, observations });
    expect(result.status).toBe('breakout');
    expect(
      result.contributors.every(
        (row) => row.isPinnedUnknown && row.isPromotedUnknown,
      ),
    ).toBe(true);
  });
  it.each(['paid', 'aggregate', 'unknown', 'organic'] as const)(
    'uses available %s counts without inferring another provenance',
    (scope) => {
      const input = fixture();
      for (const row of [input.target, ...input.observations] as Array<
        Mutable<BreakoutObservation>
      >) {
        const metric = row.exposures.impressions;
        if (!metric) throw new Error('Fixture impressions required');
        metric.scope = scope;
        row.isPromoted = scope === 'paid' ? true : null;
      }
      const result = evaluateComparableBreakout(input);
      expect(result).toMatchObject({
        status: 'breakout',
        ratio: 10,
        exposureScope: scope,
      });
      expect(
        result.contributors.every((row) => row.exposureScope === scope),
      ).toBe(true);
      expect(
        result.contributors.every(
          (row) => row.isPromoted === (scope === 'paid' ? true : null),
        ),
      ).toBe(true);
    },
  );
  it('keeps organic and paid provenance separate even when provider metric names match', () => {
    const input = fixture();
    const metric = input.observations[0].exposures.impressions;
    if (!metric) throw new Error('Fixture impressions required');
    metric.scope = 'paid';
    const result = evaluateComparableBreakout(input);
    expect(result).toMatchObject({
      status: 'insufficient_data',
      sampleSize: 4,
      exposureScope: 'organic',
    });
    expect(result.exclusions[0].reasons).toContain('different_metric_scope');
  });
  it('does not substitute views for impressions', () => {
    const input = fixture();
    const result = evaluateComparableBreakout({ ...input, metric: 'views' });
    expect(result.status).toBe('invalid_target');
    expect(result.targetValue).toBeNull();
  });
  it('does not mix different provider metric sources', () => {
    const input = fixture();
    const row = structuredClone(input.observations[0]);
    row.exposures.impressions = {
      availability: 'observed',
      value: 100,
      source: 'other.organic.impressions',
      scope: 'organic',
    };
    const result = evaluateComparableBreakout({
      ...input,
      observations: [row, ...input.observations.slice(1)],
    });
    expect(result.sampleSize).toBe(4);
    expect(result.exclusions[0].reasons).toContain('different_metric_source');
  });
  it('excludes lifetime totals and collection intervals straddling the age window', () => {
    const input = fixture();
    const lifetime = {
      ...input.observations[0],
      requestStartedAtMs: NOW - HOUR,
      receivedAtMs: NOW - HOUR + 1000,
    };
    const result = evaluateComparableBreakout({
      ...input,
      observations: [lifetime, ...input.observations.slice(1)],
    });
    expect(result.status).toBe('insufficient_data');
    expect(result.exclusions[0].reasons).toContain('incomparable_age');
    const target = {
      ...input.target,
      requestStartedAtMs:
        input.target.publishedAtMs + HOUR + input.options.toleranceMs - 500,
      receivedAtMs:
        input.target.publishedAtMs + HOUR + input.options.toleranceMs + 500,
    };
    const straddling = evaluateComparableBreakout({
      ...input,
      nowMs: target.receivedAtMs,
      target,
    });
    expect(straddling.exclusions[0].reasons).toContain('incomparable_age');
  });
  it('keeps provider-as-of evidence separate from collection-time evidence', () => {
    const input = fixture();
    const target = {
      ...input.target,
      providerAsOfMs: input.target.requestStartedAtMs,
    };
    const different = evaluateComparableBreakout({ ...input, target });
    expect(different.status).toBe('insufficient_data');
    expect(
      different.exclusions.every((row) =>
        row.reasons.includes('different_time_basis'),
      ),
    ).toBe(true);
    const observations = input.observations.map((row) => ({
      ...row,
      providerAsOfMs: row.requestStartedAtMs,
    }));
    expect(
      evaluateComparableBreakout({ ...input, target, observations }),
    ).toMatchObject({ status: 'breakout', timeBasis: 'provider_as_of' });
  });
  it('withholds invalid, unverified and future source observations', () => {
    const input = fixture();
    expect(
      evaluateComparableBreakout({
        ...input,
        target: { ...input.target, sourceValid: false },
      }).status,
    ).toBe('invalid_target');
    expect(
      evaluateComparableBreakout({
        ...input,
        target: { ...input.target, receivedAtMs: NOW + 1 },
      }).exclusions[0].reasons,
    ).toContain('future_observation');
    const slow = {
      ...input.target,
      receivedAtMs: input.target.requestStartedAtMs + 5 * 60_000 + 1,
    };
    expect(
      evaluateComparableBreakout({
        ...input,
        nowMs: slow.receivedAtMs,
        target: slow,
      }).exclusions[0].reasons,
    ).toContain('invalid_collection');
  });
  it('does not count repeated observations of one post as independent support', () => {
    const input = fixture();
    const observations = Array.from({ length: 5 }, (_, index) => ({
      ...input.observations[0],
      id: `repeat-${index}`,
    }));
    const result = evaluateComparableBreakout({ ...input, observations });
    expect(result).toMatchObject({
      status: 'insufficient_data',
      sampleSize: 1,
    });
    expect(
      result.exclusions.filter((row) => row.reasons.includes('duplicate_post')),
    ).toHaveLength(4);
  });
  it('selects the closest same-age observation deterministically without mutating input', () => {
    const input = fixture();
    const close = {
      ...input.observations[0],
      id: 'closest',
      requestStartedAtMs: input.observations[0].publishedAtMs + HOUR - 500,
      receivedAtMs: input.observations[0].publishedAtMs + HOUR + 500,
    };
    const rows = [...input.observations, close].reverse();
    const result = evaluateComparableBreakout({ ...input, observations: rows });
    expect(result.contributors[0].observationId).toBe('closest');
    expect(
      evaluateComparableBreakout({
        ...input,
        observations: [...rows].reverse(),
      }),
    ).toEqual(result);
  });
  it('excludes the target itself and posts published after it', () => {
    const input = fixture();
    const source = {
      ...input.observations[0],
      logicalPostId: input.target.logicalPostId,
    };
    const later = {
      ...input.observations[1],
      publishedAtMs: input.target.publishedAtMs + 1,
    };
    const result = evaluateComparableBreakout({
      ...input,
      observations: [source, later, ...input.observations.slice(2)],
    });
    expect(result.sampleSize).toBe(3);
    expect(result.exclusions[0].reasons).toContain('source_post');
    expect(result.exclusions[1].reasons).toContain('not_prior_post');
  });
  it('withholds incomplete bounded reads and rejects duplicate observation identities', () => {
    const input = fixture();
    expect(
      evaluateComparableBreakout({ ...input, truncated: true }).status,
    ).toBe('truncated');
    expect(
      evaluateComparableBreakout({
        ...input,
        observations: Array(2001).fill(input.observations[0]),
      }).status,
    ).toBe('truncated');
    expect(() =>
      evaluateComparableBreakout({
        ...input,
        observations: [...input.observations, input.observations[0]],
      }),
    ).toThrow('identities must be unique');
  });
  it('takes the latest bounded distinct posts and computes an even-sample median', () => {
    const input = fixture();
    const observations = Array.from({ length: 7 }, (_, index) =>
      observation(
        `prior-${index}`,
        NOW - (index + 1) * DAY,
        index < 3 ? 90 : 110,
      ),
    );
    const result = evaluateComparableBreakout({
      ...input,
      observations,
      options: { ...input.options, windowSize: 6 },
    });
    expect(result).toMatchObject({
      sampleSize: 6,
      median: 100,
      ratio: 10,
      status: 'breakout',
    });
    expect(result.exclusions[0].reasons).toContain('outside_window');
  });
  it('rejects weakened thresholds and insufficient baseline configuration', () => {
    const input = fixture();
    expect(() =>
      evaluateComparableBreakout({
        ...input,
        options: { ...input.options, breakoutThreshold: 9 },
      }),
    ).toThrow('at least ten');
    expect(() =>
      evaluateComparableBreakout({
        ...input,
        options: { ...input.options, minimumSampleSize: 4 },
      }),
    ).toThrow('5–50');
    expect(() =>
      evaluateComparableBreakout({
        ...input,
        options: { ...input.options, toleranceMs: HOUR },
      }),
    ).toThrow('age window');
  });
});
