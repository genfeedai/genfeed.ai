import { describe, expect, it } from 'vitest';
import {
  AD_DIALOGUE_MAX_WORD_ERROR_RATE,
  diffAdDialogue,
  normalizeDialogueWords,
  srtToText,
} from './ad-dialogue-diff';

describe('ad dialogue diff', () => {
  it('scores an identical take as zero', () => {
    expect(
      diffAdDialogue('Try this serum today', 'try this serum today'),
    ).toEqual({
      actualWordCount: 4,
      added: [],
      changed: [],
      expectedWordCount: 4,
      removed: [],
      wordErrorRate: 0,
    });
  });

  it('reports one added word', () => {
    const diff = diffAdDialogue('Try this serum', 'Try this new serum');
    expect(diff.added).toEqual(['new']);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([]);
    expect(diff.wordErrorRate).toBeCloseTo(1 / 3);
  });

  it('reports one dropped word', () => {
    const diff = diffAdDialogue('Try this new serum', 'Try this serum');
    expect(diff.removed).toEqual(['new']);
    expect(diff.added).toEqual([]);
    expect(diff.wordErrorRate).toBeCloseTo(1 / 4);
  });

  it('reports a swapped word as changed', () => {
    const diff = diffAdDialogue('Try this serum', 'Try this cream');
    expect(diff.changed).toEqual([{ actual: 'cream', expected: 'serum' }]);
    expect(diff.wordErrorRate).toBeCloseTo(1 / 3);
  });

  it('counts a reordered script as errors', () => {
    const diff = diffAdDialogue('one two three', 'three two one');
    expect(diff.changed).toEqual([
      { actual: '3', expected: '1' },
      { actual: '1', expected: '3' },
    ]);
    expect(diff.wordErrorRate).toBeCloseTo(2 / 3);
  });

  it('treats number words and digits as the same words', () => {
    expect(
      diffAdDialogue(
        'Save 25 dollars on 3 items',
        'Save twenty five dollars on three items',
      ).wordErrorRate,
    ).toBe(0);
    expect(normalizeDialogueWords('one hundred and 5')).toEqual([
      '100',
      'and',
      '5',
    ]);
    expect(normalizeDialogueWords('Only 1,200 left')).toEqual([
      'only',
      '1200',
      'left',
    ]);
  });

  it('ignores punctuation and case', () => {
    expect(
      diffAdDialogue("Wait... don't miss it!", 'wait dont miss it')
        .wordErrorRate,
    ).toBe(0);
  });

  it('scores an empty script against spoken words as a full miss', () => {
    expect(diffAdDialogue('', 'hello there').wordErrorRate).toBe(1);
    expect(diffAdDialogue('', '').wordErrorRate).toBe(0);
  });

  it('keeps the review threshold below a coin flip', () => {
    expect(AD_DIALOGUE_MAX_WORD_ERROR_RATE).toBeGreaterThan(0);
    expect(AD_DIALOGUE_MAX_WORD_ERROR_RATE).toBeLessThan(0.5);
  });

  it('reads the spoken text out of an SRT transcript', () => {
    expect(
      srtToText(
        '1\n00:00:00,000 --> 00:00:02,000\nTry this\n\n2\n00:00:02,000 --> 00:00:04,500\nserum today\n',
      ),
    ).toBe('Try this serum today');
  });
});
