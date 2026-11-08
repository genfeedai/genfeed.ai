import { describe, expect, it } from 'vitest';
import { getDrawableArtwork } from './artwork';

describe('getDrawableArtwork', () => {
  it.each([
    [
      'https://cdn.genfeed.ai/ingredients/cover.jpg',
      'https://cdn.genfeed.ai/ingredients/cover.jpg',
    ],
    ['http://169.254.169.254/latest/meta-data', undefined],
    ['https://cdn.genfeed.ai.example.com/cover.jpg', undefined],
    ['not a url', undefined],
    [undefined, undefined],
  ])('draws %s as %s', (cover, expected) => {
    expect(getDrawableArtwork(cover)).toBe(expected);
  });
});
