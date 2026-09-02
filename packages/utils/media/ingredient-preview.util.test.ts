import { IngredientCategory } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import {
  getIngredientPreviewUrl,
  isRasterPreviewUrl,
} from './ingredient-preview.util';

function video(overrides: Partial<IIngredient> = {}): IIngredient {
  return {
    category: IngredientCategory.VIDEO,
    id: 'video-1',
    ...overrides,
  } as IIngredient;
}

describe('isRasterPreviewUrl', () => {
  it('rejects video and audio URLs, including query strings', () => {
    expect(isRasterPreviewUrl('https://cdn.example/clip.mp4')).toBe(false);
    expect(isRasterPreviewUrl('https://cdn.example/clip.mp4?token=1')).toBe(
      false,
    );
    expect(isRasterPreviewUrl('https://cdn.example/line.mp3')).toBe(false);
  });

  it('accepts image URLs', () => {
    expect(isRasterPreviewUrl('https://cdn.example/poster.jpg')).toBe(true);
    expect(isRasterPreviewUrl('https://cdn.example/frame.webp')).toBe(true);
  });
});

describe('getIngredientPreviewUrl', () => {
  it('uses the thumbnail for a video and never the mp4', () => {
    expect(
      getIngredientPreviewUrl(
        video({
          ingredientUrl: 'https://cdn.example/clip.mp4',
          thumbnailUrl: 'https://cdn.example/poster.jpg',
        }),
      ),
    ).toBe('https://cdn.example/poster.jpg');
  });

  it('returns undefined when a video has no raster poster', () => {
    expect(
      getIngredientPreviewUrl(
        video({
          ingredientUrl: 'https://cdn.example/clip.mp4',
        }),
      ),
    ).toBeUndefined();
  });

  it('uses the same poster rule for VIDEO_EDIT', () => {
    expect(
      getIngredientPreviewUrl(
        video({
          category: IngredientCategory.VIDEO_EDIT,
          ingredientUrl: 'https://cdn.example/edit.mp4',
          thumbnailUrl: 'https://cdn.example/edit.jpg',
        }),
      ),
    ).toBe('https://cdn.example/edit.jpg');
  });

  it('prefers the asset URL for images', () => {
    expect(
      getIngredientPreviewUrl({
        category: IngredientCategory.IMAGE,
        id: 'image-1',
        ingredientUrl: 'https://cdn.example/hero.png',
        thumbnailUrl: 'https://cdn.example/hero-thumb.jpg',
      } as IIngredient),
    ).toBe('https://cdn.example/hero.png');
  });
});
