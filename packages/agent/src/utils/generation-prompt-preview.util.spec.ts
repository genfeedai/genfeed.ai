import { describe, expect, it } from 'vitest';
import { shouldOfferGenerationPromptPreview } from './generation-prompt-preview.util';

describe('shouldOfferGenerationPromptPreview', () => {
  it('hides the preview for an empty or one-line prompt', () => {
    expect(shouldOfferGenerationPromptPreview('')).toBe(false);
    expect(shouldOfferGenerationPromptPreview('   ')).toBe(false);
    expect(shouldOfferGenerationPromptPreview('A short scene.')).toBe(false);
  });

  it('offers a preview when the prompt needs more than one compact row', () => {
    expect(
      shouldOfferGenerationPromptPreview(
        'SCENE: A cinematic launch-day moment.\nSUBJECT: Elon Musk.',
      ),
    ).toBe(true);
    expect(
      shouldOfferGenerationPromptPreview(
        [
          'SCENE: A cinematic launch-day moment.',
          '',
          'SUBJECT: Elon Musk in a black flight suit.',
          '',
          'BACKGROUND: Dawn at the spaceport.',
        ].join('\n'),
      ),
    ).toBe(true);
  });

  it('offers a preview for a long single line that will clip', () => {
    expect(shouldOfferGenerationPromptPreview('word '.repeat(50))).toBe(true);
  });
});
