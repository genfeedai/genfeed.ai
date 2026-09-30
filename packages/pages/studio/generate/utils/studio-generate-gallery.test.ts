import { IngredientCategory } from '@genfeedai/contracts';
import type { Ingredient } from '@genfeedai/models/content/ingredient.model';
import { describe, expect, it, vi } from 'vitest';
import {
  buildStudioGalleryQuery,
  loadStudioGalleryIngredients,
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
      IngredientCategory.GIF,
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
        IngredientCategory.GIF,
      ],
      limit: 100,
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

describe('bounded Studio gallery loading', () => {
  const ingredients = (start: number, count: number) =>
    Array.from(
      { length: count },
      (_, i) => ({ id: `ingredient-${start + i}` }) as Ingredient,
    );
  it('keeps 120 unique All results through bounded pages in response order', async () => {
    const findAllPage = vi
      .fn()
      .mockResolvedValueOnce({ items: ingredients(0, 100), totalPages: 3 })
      .mockResolvedValueOnce({ items: ingredients(100, 100), totalPages: 3 });
    const signal = new AbortController().signal;
    const items = await loadStudioGalleryIngredients(
      { findAllPage },
      'brand-1',
      'all',
      signal,
    );
    expect(items).toHaveLength(120);
    expect(items[119].id).toBe('ingredient-119');
    expect(findAllPage).toHaveBeenCalledTimes(2);
    expect(findAllPage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        brandId: 'brand-1',
        limit: 100,
        page: 1,
        sort: 'createdAt: -1',
      }),
      signal,
    );
    expect(findAllPage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ brandId: 'brand-1', limit: 100, page: 2 }),
      signal,
    );
  });
  it('loads one page of 24 for an individual category', async () => {
    const findAllPage = vi
      .fn()
      .mockResolvedValue({ items: ingredients(0, 24), totalPages: 10 });
    expect(
      await loadStudioGalleryIngredients(
        { findAllPage },
        'brand-1',
        'video',
        new AbortController().signal,
      ),
    ).toHaveLength(24);
    expect(findAllPage).toHaveBeenCalledTimes(1);
  });
  it('does not fetch an unresolved brand', async () => {
    const findAllPage = vi.fn();
    expect(
      await loadStudioGalleryIngredients(
        { findAllPage },
        '',
        'all',
        new AbortController().signal,
      ),
    ).toEqual([]);
    expect(findAllPage).not.toHaveBeenCalled();
  });
  it('deduplicates overlaps and stops when the server has no more pages', async () => {
    const findAllPage = vi
      .fn()
      .mockResolvedValueOnce({ items: ingredients(0, 100), totalPages: 2 })
      .mockResolvedValueOnce({ items: ingredients(95, 20), totalPages: 2 });
    const items = await loadStudioGalleryIngredients(
      { findAllPage },
      'brand-1',
      'all',
      new AbortController().signal,
    );
    expect(items).toHaveLength(115);
    expect(new Set(items.map((item) => item.id)).size).toBe(115);
  });
});
