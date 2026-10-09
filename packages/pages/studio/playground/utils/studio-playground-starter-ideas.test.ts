import { describe, expect, it } from 'vitest';
import {
  buildStarterIdeaDocument,
  pickStarterCharacter,
  pickStarterProductReference,
  STUDIO_PLAYGROUND_STARTER_IDEAS,
  starterIdeaPromptTemplate,
  starterProductReferenceRole,
} from './studio-playground-starter-ideas';

const anna = { handle: 'anna', id: 'char-anna', label: 'Anna' };

describe('studio generate starter ideas', () => {
  it('covers every generator and keeps product and cinematic video apart', () => {
    expect(STUDIO_PLAYGROUND_STARTER_IDEAS.map((idea) => idea.id)).toEqual([
      'productPhoto',
      'productAd',
      'cinematicVideo',
      'soundtrack',
      'avatarIntro',
      'voiceover',
    ]);
    expect(
      new Set(STUDIO_PLAYGROUND_STARTER_IDEAS.map((idea) => idea.type)),
    ).toEqual(new Set(['image', 'video', 'music', 'avatar', 'voice']));
  });

  it('uses the influencer template only for product ideas that tag a character', () => {
    const productPhoto = STUDIO_PLAYGROUND_STARTER_IDEAS[0];
    const cinematic = STUDIO_PLAYGROUND_STARTER_IDEAS[2];
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

  it('attaches only a product still, never a face, style, or logo', () => {
    expect(
      pickStarterProductReference([
        {
          cdnUrl: 'https://cdn.example/face.png',
          displayName: 'Anna',
          id: 'face-1',
          referenceCategory: 'FACE',
        },
        {
          cdnUrl: 'https://cdn.example/bottle.png',
          displayName: 'Bottle',
          id: 'bottle-1',
          referenceCategory: 'PRODUCT',
        },
      ]),
    ).toEqual({
      id: 'bottle-1',
      label: 'Bottle',
      previewUrl: 'https://cdn.example/bottle.png',
    });
    expect(
      pickStarterProductReference([
        {
          cdnUrl: 'https://cdn.example/style.png',
          id: 'style-1',
          referenceCategory: 'STYLE',
        },
        {
          cdnUrl: 'https://cdn.example/logo.png',
          id: 'logo-1',
          referenceCategory: 'LOGO',
        },
        { cdnUrl: 'https://cdn.example/plain.png', id: 'plain-1' },
        { cdnUrl: '   ', id: 'blank-url', referenceCategory: 'PRODUCT' },
        null,
        'nope',
      ]),
    ).toBeUndefined();
    expect(pickStarterProductReference(undefined)).toBeUndefined();
    expect(
      pickStarterProductReference([
        {
          cdnUrl: 'https://cdn.example/bottle.png',
          displayName: '   ',
          id: 'bottle-1',
          referenceCategory: 'PRODUCT',
        },
      ]),
    ).toEqual({
      id: 'bottle-1',
      previewUrl: 'https://cdn.example/bottle.png',
    });
    expect(starterProductReferenceRole('image')).toBe('reference');
    expect(starterProductReferenceRole('video')).toBe('startFrame');
    expect(
      STUDIO_PLAYGROUND_STARTER_IDEAS.filter(
        (idea) => idea.usesProductReference,
      ).map((idea) => idea.id),
    ).toEqual(['productPhoto', 'productAd']);
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
