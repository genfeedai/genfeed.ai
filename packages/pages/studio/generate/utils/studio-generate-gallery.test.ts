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
  it('keeps All at 24 rows for one category instead of 24 times five', () => {
    expect(
      buildStudioGalleryQuery(
        'brand-1',
        'all',
        STUDIO_GALLERY_PAGE_SIZE,
        IngredientCategory.IMAGE,
      ),
    ).toEqual({
      brandId: 'brand-1',
      categories: [IngredientCategory.IMAGE],
      limit: STUDIO_GALLERY_PAGE_SIZE,
      sort: 'createdAt: -1',
    });
    expect(buildStudioGalleryQuery('brand-1', 'all').limit).toBe(
      STUDIO_GALLERY_PAGE_SIZE,
    );
    expect(buildStudioGalleryQuery('brand-1', 'all').limit).toBeLessThanOrEqual(
      100,
    );
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
  const page = (items: Ingredient[], totalPages = 1) => ({
    hasNext: totalPages > 1,
    hasPrevious: false,
    items,
    page: 1,
    pageSize: STUDIO_GALLERY_PAGE_SIZE,
    total: items.length * totalPages,
    totalPages,
  });
  it('requests 24 rows for each All category and never asks for more than 100', async () => {
    const categories = resolveStudioGalleryCategories('all');
    const findAllPage = vi.fn();
    findAllPage.mockImplementation(async (query: Record<string, unknown>) => {
      const listed = query.categories;
      const selected = Array.isArray(listed) ? listed[0] : undefined;
      const index =
        typeof selected === 'string'
          ? categories.indexOf(selected as IngredientCategory)
          : -1;
      return page(ingredients(Math.max(index, 0) * 24, 24), 3);
    });
    const signal = new AbortController().signal;
    const items = await loadStudioGalleryIngredients(
      { findAllPage },
      'brand-1',
      'all',
      signal,
    );
    expect(items).toHaveLength(24 * categories.length);
    expect(findAllPage).toHaveBeenCalledTimes(categories.length);
    for (const [index, category] of categories.entries()) {
      expect(findAllPage).toHaveBeenNthCalledWith(
        index + 1,
        expect.objectContaining({
          brandId: 'brand-1',
          categories: [category],
          limit: 24,
          page: 1,
          sort: 'createdAt: -1',
        }),
        signal,
        { handledErrorStatuses: [408, 429, 500, 502, 503, 504] },
      );
    }
  });
  it('loads one page of 24 for an individual category', async () => {
    const findAllPage = vi.fn().mockResolvedValue(page(ingredients(0, 24), 10));
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
  it('rejects a later-category failure without publishing earlier categories', async () => {
    const failure = new Error('next category unavailable');
    const findAllPage = vi
      .fn()
      .mockResolvedValueOnce(page(ingredients(0, 24), 2))
      .mockRejectedValueOnce(failure);
    const signal = new AbortController().signal;
    await expect(
      loadStudioGalleryIngredients({ findAllPage }, 'brand-1', 'all', signal),
    ).rejects.toBe(failure);
    expect(findAllPage).toHaveBeenCalledTimes(2);
    for (const call of findAllPage.mock.calls) {
      expect(call[0]).toEqual(expect.objectContaining({ limit: 24, page: 1 }));
    }
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
  it('deduplicates an ingredient returned by more than one category', async () => {
    const shared = ingredients(0, 1);
    const findAllPage = vi.fn(async () => page(shared));
    const items = await loadStudioGalleryIngredients(
      { findAllPage },
      'brand-1',
      'all',
      new AbortController().signal,
    );
    expect(items).toHaveLength(1);
    expect(findAllPage).toHaveBeenCalledTimes(
      resolveStudioGalleryCategories('all').length,
    );
  });
});
