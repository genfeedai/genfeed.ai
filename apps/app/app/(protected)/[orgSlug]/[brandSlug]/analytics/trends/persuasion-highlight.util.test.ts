import type { IPersuasionScores } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import { getPersuasionHighlight } from './persuasion-highlight.util';

function buildPersuasionScores(
  overrides: Partial<IPersuasionScores> = {},
): IPersuasionScores {
  return {
    ctaNaturalness: 40,
    demandFit: 40,
    hookStrength: 40,
    openLoopIntegrity: 40,
    overall: 40,
    ...overrides,
  };
}

describe('getPersuasionHighlight', () => {
  it('returns undefined when there is no persuasion result', () => {
    expect(getPersuasionHighlight(undefined)).toBeUndefined();
  });

  it('picks the highest-scoring layer', () => {
    const highlight = getPersuasionHighlight(
      buildPersuasionScores({ hookStrength: 92 }),
    );

    expect(highlight).toEqual({
      id: 'hookStrength',
      label: 'Choice',
      score: 92,
    });
  });

  it('keeps the first layer on a tie, matching the published layer order', () => {
    const highlight = getPersuasionHighlight(
      buildPersuasionScores({
        ctaNaturalness: 80,
        demandFit: 80,
      }),
    );

    expect(highlight?.id).toBe('demandFit');
  });
});
