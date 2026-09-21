import {
  buildRecordNextPrompt,
  derivePatternText,
  resolveWeakestPositioningDimension,
} from '@api/collections/content-performance/services/email-digest-expert.util';
import { describe, expect, it } from 'vitest';

describe('resolveWeakestPositioningDimension', () => {
  it('returns null when there is no weakest dimension yet', () => {
    expect(resolveWeakestPositioningDimension(undefined)).toBeNull();
  });

  it('maps a known dimension key to its label and follow-up question', () => {
    const dimension = resolveWeakestPositioningDimension('bigDomino');

    expect(dimension).toEqual({
      followUpQuestion: expect.stringContaining('Finish this sentence'),
      label: 'Big Domino',
    });
  });
});

describe('derivePatternText', () => {
  it('prefers the extracted pattern description over the formula and label', () => {
    expect(
      derivePatternText(
        {
          description: 'Open with a contrarian claim, then prove it.',
          formula: 'claim + proof',
          label: 'Contrarian opener',
        },
        null,
      ),
    ).toBe('Open with a contrarian claim, then prove it.');
  });

  it('falls back to the formula when there is no description', () => {
    expect(
      derivePatternText(
        { formula: 'claim + proof', label: 'Contrarian opener' },
        null,
      ),
    ).toBe('claim + proof');
  });

  it('falls back to the label when there is no description or formula', () => {
    expect(derivePatternText({ label: 'Contrarian opener' }, null)).toBe(
      'Contrarian opener',
    );
  });

  it('derives a deterministic excerpt from the top winner when no pattern exists', () => {
    expect(
      derivePatternText(null, {
        content:
          'Winning post on twitter (4.20% engagement): Ship the OS, not another wrapper. Read more here.',
        platform: 'twitter',
      }),
    ).toBe('your twitter opening — "Ship the OS, not another wrapper"');
  });

  it('returns null when there is neither a pattern nor a winner', () => {
    expect(derivePatternText(null, null)).toBeNull();
  });
});

describe('buildRecordNextPrompt', () => {
  it('prompts for a corpus addition when no winners were promoted', () => {
    const prompt = buildRecordNextPrompt({
      hasWinners: false,
      patternText: null,
      weakestDimension: null,
    });

    expect(prompt).toContain('No ideas were promoted this week');
    expect(prompt).toContain('source material');
  });

  it('combines the pattern with the weakest dimension follow-up when both exist', () => {
    const prompt = buildRecordNextPrompt({
      hasWinners: true,
      patternText: 'your contrarian opener',
      weakestDimension: {
        followUpQuestion: 'What proof do you have?',
        label: 'Authority signals',
      },
    });

    expect(prompt).toBe(
      'Record a 3-minute voice note that applies your contrarian opener to authority signals: What proof do you have?',
    );
  });

  it('falls back to a generic positioning prompt when there is no weakest dimension', () => {
    const prompt = buildRecordNextPrompt({
      hasWinners: true,
      patternText: 'your contrarian opener',
      weakestDimension: null,
    });

    expect(prompt).toBe(
      'Record a 3-minute voice note that applies your contrarian opener to your positioning. Capture one story your audience hasn’t heard yet.',
    );
  });
});
