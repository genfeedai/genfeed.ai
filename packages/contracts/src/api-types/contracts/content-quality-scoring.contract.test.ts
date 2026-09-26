import { describe, expect, it } from 'vitest';
import {
  contentQualityVisionScoringSchema,
  deriveVisionFlags,
} from './content-quality-scoring.contract';

const CLEAN = {
  artifactLevel: 'none',
  brandReadiness: 'ready',
  compositionQuality: 'strong',
  hookStrength: 'strong',
} as const;

describe('deriveVisionFlags', () => {
  it('raises nothing for a clean rubric', () => {
    expect(deriveVisionFlags(CLEAN)).toEqual({
      isFlagged: false,
      reasons: [],
      severity: 'info',
    });
  });

  it('flags severe artifacts and unready assets as critical', () => {
    expect(
      deriveVisionFlags({
        ...CLEAN,
        artifactLevel: 'severe',
        brandReadiness: 'not_ready',
      }),
    ).toEqual({
      isFlagged: true,
      reasons: ['severe_artifacts', 'not_brand_ready'],
      severity: 'critical',
    });
  });

  it('flags weak composition as a warning', () => {
    expect(deriveVisionFlags({ ...CLEAN, compositionQuality: 'weak' })).toEqual(
      { isFlagged: true, reasons: ['weak_composition'], severity: 'warning' },
    );
  });

  it('records info-level reasons without flagging', () => {
    expect(
      deriveVisionFlags({
        ...CLEAN,
        artifactLevel: 'minor',
        brandReadiness: 'needs_polish',
      }),
    ).toEqual({
      isFlagged: false,
      reasons: ['minor_artifacts', 'needs_brand_polish'],
      severity: 'info',
    });
  });

  it('rejects a prose-only or out-of-rubric answer', () => {
    expect(
      contentQualityVisionScoringSchema.safeParse({
        feedback: ['looks fine'],
        score: 7,
        suggestions: [],
      }).success,
    ).toBe(false);
    expect(
      contentQualityVisionScoringSchema.safeParse({
        feedback: [],
        rubric: { ...CLEAN, artifactLevel: 'catastrophic' },
        score: 7,
        suggestions: [],
      }).success,
    ).toBe(false);
  });
});
