import { describe, expect, it } from 'vitest';
import {
  buildStarterIdeaDocument,
  pickStarterCharacter,
  STUDIO_GENERATE_STARTER_IDEAS,
  starterIdeaPromptTemplate,
} from './studio-generate-starter-ideas';

const anna = { handle: 'anna', id: 'char-anna', label: 'Anna' };

describe('studio generate starter ideas', () => {
  it('covers every generator and keeps product and cinematic video apart', () => {
    expect(STUDIO_GENERATE_STARTER_IDEAS.map((idea) => idea.id)).toEqual([
      'productPhoto',
      'productAd',
      'cinematicVideo',
      'soundtrack',
      'avatarIntro',
      'voiceover',
    ]);
    expect(
      new Set(STUDIO_GENERATE_STARTER_IDEAS.map((idea) => idea.type)),
    ).toEqual(new Set(['image', 'video', 'music', 'avatar', 'voice']));
  });

  it('uses the influencer template only for product ideas that tag a character', () => {
    const productPhoto = STUDIO_GENERATE_STARTER_IDEAS[0];
    const cinematic = STUDIO_GENERATE_STARTER_IDEAS[2];
    expect(productPhoto).toBeDefined();
    expect(cinematic).toBeDefined();
    if (!productPhoto || !cinematic) {
      return;
    }

    expect(starterIdeaPromptTemplate(productPhoto, false)).toBe(
      'product-photo',
    );
    expect(starterIdeaPromptTemplate(productPhoto, true)).toBe(
      'influencer-photo',
    );
    expect(starterIdeaPromptTemplate(cinematic, true)).toBe('cinematic-video');
  });

  it('inserts one character mention between the lead and the tail', () => {
    expect(buildStarterIdeaDocument('Photo of ', ' on set.', anna)).toEqual({
      content: [
        {
          content: [
            { text: 'Photo of ', type: 'text' },
            {
              attrs: { handle: 'anna', id: 'char-anna', label: 'Anna' },
              type: 'characterMention',
            },
            { text: ' on set.', type: 'text' },
          ],
          type: 'paragraph',
        },
      ],
      type: 'doc',
    });
  });

  it('prefers a character that has a reference image', () => {
    expect(
      pickStarterCharacter([
        { handle: 'no-ref', hasReferenceImage: false, id: 'a', label: 'No' },
        { handle: 'anna', hasReferenceImage: true, id: 'b', label: 'Anna' },
      ]),
    ).toEqual({ handle: 'anna', id: 'b', label: 'Anna' });
    expect(pickStarterCharacter([])).toBeUndefined();
  });

  it('keeps a plain sentence when no character is tagged', () => {
    expect(
      buildStarterIdeaDocument('Product photo on white.', undefined, undefined),
    ).toEqual({
      content: [
        {
          content: [{ text: 'Product photo on white.', type: 'text' }],
          type: 'paragraph',
        },
      ],
      type: 'doc',
    });
  });
});
