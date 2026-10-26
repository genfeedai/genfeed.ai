import { describe, expect, it } from 'vitest';
import {
  compareStructuredPromptSlots,
  type SlotOutcomeObservation,
} from '../../src/learning/slot-comparison';

function repeat(
  count: number,
  make: (index: number) => SlotOutcomeObservation,
): SlotOutcomeObservation[] {
  return Array.from({ length: count }, (_, index) => make(index));
}

/** Small deterministic spread around a centre, so groups have variance. */
function around(centre: number, index: number): number {
  return centre + (((index * 7) % 11) - 5) * 0.02;
}

describe('compareStructuredPromptSlots', () => {
  it('calls a clear gap better and its mirror worse', () => {
    const observations = [
      ...repeat(40, (i) => ({
        slots: { lighting: 'golden hour' },
        reward: around(0.5, i),
      })),
      ...repeat(40, (i) => ({ slots: {}, reward: around(0, i) })),
    ];

    const report = compareStructuredPromptSlots(observations, {
      replicates: 500,
    });
    const filled = report.comparisons.find(
      (c) => c.slot === 'lighting' && c.value === null,
    );

    expect(filled?.verdict).toBe('better');
    expect(filled?.difference).toBeCloseTo(0.5, 1);
    expect(filled?.lower).toBeGreaterThan(0);

    const flipped = compareStructuredPromptSlots(
      observations.map((row) => ({ ...row, reward: -row.reward })),
      { replicates: 500 },
    ).comparisons.find((c) => c.slot === 'lighting' && c.value === null);
    expect(flipped?.verdict).toBe('worse');
  });

  it('never calls a gap inside the noise a winner', () => {
    const observations = [
      ...repeat(40, (i) => ({
        slots: { mood: 'calm' },
        reward: around(0.1, i + 3),
      })),
      ...repeat(40, (i) => ({ slots: {}, reward: around(0.1, i) })),
    ];

    const comparison = compareStructuredPromptSlots(observations, {
      replicates: 500,
    }).comparisons.find((c) => c.slot === 'mood' && c.value === null);

    expect(comparison?.verdict).toBe('within_noise');
  });

  it('reports insufficient data rather than ranking a small group', () => {
    const observations = [
      ...repeat(5, () => ({ slots: { style: 'noir' }, reward: 0.9 })),
      ...repeat(40, () => ({ slots: {}, reward: 0 })),
    ];

    const comparison = compareStructuredPromptSlots(observations, {
      replicates: 100,
    }).comparisons.find((c) => c.slot === 'style' && c.value === null);

    expect(comparison).toMatchObject({
      verdict: 'insufficient_data',
      lower: null,
      upper: null,
    });
    expect(comparison?.difference).toBeCloseTo(0.9);
  });

  it('compares a common value with the rest and skips rare ones', () => {
    const observations = [
      ...repeat(30, (i) => ({
        slots: { style: 'Noir' },
        reward: around(0.6, i),
      })),
      ...repeat(30, (i) => ({
        slots: { style: 'pop art' },
        reward: around(0, i),
      })),
      { slots: { style: 'one-off' }, reward: 0.2 },
    ];

    const values = compareStructuredPromptSlots(observations, {
      replicates: 300,
    })
      .comparisons.filter((c) => c.slot === 'style' && c.value !== null)
      .map((c) => [c.value, c.verdict]);

    // Values match case-insensitively; the single phrasing is left out.
    expect(values).toEqual([
      ['noir', 'better'],
      ['pop art', 'worse'],
    ]);
  });

  it('widens the interval as more comparisons are made', () => {
    const rows = [
      ...repeat(30, (i) => ({
        slots: { lighting: 'neon', mood: 'calm' },
        reward: around(0.2, i),
      })),
      ...repeat(30, (i) => ({ slots: {}, reward: around(0, i) })),
    ];

    const report = compareStructuredPromptSlots(rows, { replicates: 200 });

    expect(report.comparisonCount).toBeGreaterThan(1);
    expect(report.alpha).toBeCloseTo(0.05 / report.comparisonCount);
  });

  it('drops rewards that are not finite or outside [-1, 1]', () => {
    const report = compareStructuredPromptSlots(
      [
        { slots: { style: 'noir' }, reward: Number.NaN },
        { slots: { style: 'noir' }, reward: 3 },
        { slots: { style: 'noir' }, reward: 0.5 },
      ],
      { replicates: 10 },
    );

    expect(report.observationCount).toBe(1);
    expect(report.excludedCount).toBe(2);
  });

  it('gives the same report for the same seed', () => {
    const rows = [
      ...repeat(30, (i) => ({
        slots: { camera: 'low angle' },
        reward: around(0.3, i),
      })),
      ...repeat(30, (i) => ({ slots: {}, reward: around(0, i) })),
    ];

    expect(
      compareStructuredPromptSlots(rows, { replicates: 200, seed: 'a' }),
    ).toEqual(
      compareStructuredPromptSlots(rows, { replicates: 200, seed: 'a' }),
    );
  });

  it('treats list slots as filled when they hold any entry', () => {
    const rows = [
      ...repeat(30, (i) => ({
        slots: { avoid: ['text', 'logos'] },
        reward: around(0.4, i),
      })),
      ...repeat(30, (i) => ({ slots: {}, reward: around(0, i) })),
    ];

    const comparison = compareStructuredPromptSlots(rows, {
      replicates: 300,
    }).comparisons.find((c) => c.slot === 'avoid');

    expect(comparison?.filled.count).toBe(30);
    expect(comparison?.verdict).toBe('better');
  });
});
