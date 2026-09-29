import { IngredientCategory } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import {
  buildStudioGalleryQuery,
  resolveStudioGalleryCategories,
  STUDIO_GALLERY_PAGE_SIZE,
} from './studio-generate-gallery';

describe('resolveStudioGalleryCategories', () => {
  it('maps a concrete filter to its persisted output category', () => {
    expect(resolveStudioGalleryCategories('music')).toEqual([
      IngredientCategory.MUSIC,
    ]);
    expect(resolveStudioGalleryCategories('voice')).toEqual([
      IngredientCategory.VOICE,
    ]);
    expect(resolveStudioGalleryCategories('avatar')).toEqual([
      IngredientCategory.VIDEO,
    ]);
  });
});

describe('buildStudioGalleryQuery', () => {
  it('scopes the hydrated collection to the selected brand and output categories', () => {
    expect(buildStudioGalleryQuery('brand-1', 'all')).toEqual({
      brandId: 'brand-1',
      categories: [
        IngredientCategory.IMAGE,
        IngredientCategory.VIDEO,
        IngredientCategory.MUSIC,
        IngredientCategory.VOICE,
        IngredientCategory.GIF,
      ],
      limit: STUDIO_GALLERY_PAGE_SIZE * 5,
      sort: 'createdAt: -1',
    });
  });

  it('omits the brand filter entirely when no brand is resolved', () => {
    expect(buildStudioGalleryQuery('', 'image')).toEqual({
      categories: [IngredientCategory.IMAGE],
      limit: STUDIO_GALLERY_PAGE_SIZE,
      sort: 'createdAt: -1',
    });
  });
});
