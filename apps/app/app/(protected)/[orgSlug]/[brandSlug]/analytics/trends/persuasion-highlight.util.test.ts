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
  it('retains the full first saved nonempty observation without generating evidence', () => {
    const observation = 'Saved content-specific observation. '.repeat(30);
    expect(
      getPersuasionHighlight(buildPersuasionScores(), [
        '',
        '  ',
        observation,
        'later',
      ])?.analysisNote,
    ).toBe(observation.trim());
    expect(
      getPersuasionHighlight(buildPersuasionScores())?.analysisNote,
    ).toBeUndefined();
  });
  it('omits malformed or incomplete persuasion despite a saved note', () => {
    expect(
      getPersuasionHighlight({ demandFit: 90 } as IPersuasionScores, ['saved']),
    ).toBeUndefined();
    expect(
      getPersuasionHighlight(
        buildPersuasionScores({ hookStrength: Number.NaN }),
        ['saved'],
      ),
    ).toBeUndefined();
  });
});
