import { IngredientCategory } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import {
  buildStudioGalleryQuery,
  resolveStudioGalleryCategories,
  STUDIO_GALLERY_PAGE_SIZE,
} from './studio-generate-gallery';

describe('resolveStudioGalleryCategories', () => {
  it('loads every generated output category through the hydrated ingredients collection', () => {
    expect(resolveStudioGalleryCategories('all')).toEqual([
      IngredientCategory.IMAGE,
      IngredientCategory.VIDEO,
      IngredientCategory.MUSIC,
      IngredientCategory.VOICE,
    ]);
  });

  it('never requests one output category twice', () => {
    const categories = resolveStudioGalleryCategories('all');

    expect(new Set(categories).size).toBe(categories.length);
  });

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
      ],
      limit: STUDIO_GALLERY_PAGE_SIZE * 4,
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

  it('honours an explicit limit', () => {
    expect(buildStudioGalleryQuery('brand-1', 'video', 4).limit).toBe(4);
  });
});
