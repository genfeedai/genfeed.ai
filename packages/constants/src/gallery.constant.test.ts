import { CardEmptySize, IngredientStatus } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';
import {
  GALLERY_CONTAINER_PADDING,
  GALLERY_DEFAULT_SORT,
  GALLERY_DEFAULT_STATUSES,
  GALLERY_EMPTY_MESSAGES,
  GALLERY_EMPTY_SIZE,
  GALLERY_GRID_CLASS,
  GALLERY_MENU_ITEMS,
  type GalleryType,
} from './gallery.constant';

describe('gallery.constant', () => {
  it('GALLERY_GRID_CLASS contains grid classes', () => {
    expect(GALLERY_GRID_CLASS).toContain('grid');
  });

  it('GALLERY_CONTAINER_PADDING contains padding', () => {
    expect(GALLERY_CONTAINER_PADDING).toContain('p-');
  });

  it('GALLERY_EMPTY_SIZE is CardEmptySize.LG', () => {
    expect(GALLERY_EMPTY_SIZE).toBe(CardEmptySize.LG);
  });

  it('GALLERY_DEFAULT_SORT sorts by createdAt desc', () => {
    expect(GALLERY_DEFAULT_SORT).toBe('createdAt: -1');
  });

  it('GALLERY_DEFAULT_STATUSES includes generated and validated', () => {
    expect(GALLERY_DEFAULT_STATUSES).toContain(IngredientStatus.GENERATED);
    expect(GALLERY_DEFAULT_STATUSES).toContain(IngredientStatus.VALIDATED);
  });

  it('GALLERY_MENU_ITEMS has entries with href, label, iconName', () => {
    expect(GALLERY_MENU_ITEMS.length).toBeGreaterThan(0);
    for (const item of GALLERY_MENU_ITEMS) {
      expect(item.href).toBeTruthy();
      expect(item.label).toBeTruthy();
      expect(item.iconName).toBeTruthy();
    }
  });

  it('GALLERY_EMPTY_MESSAGES covers all gallery types', () => {
    const types: GalleryType[] = [
      'images',
      'videos',
      'musics',
      'posts',
      'leaderboard',
      'prompts',
    ];
    for (const type of types) {
      expect(GALLERY_EMPTY_MESSAGES[type]).toBeDefined();
      expect(GALLERY_EMPTY_MESSAGES[type].label).toBeTruthy();
      expect(GALLERY_EMPTY_MESSAGES[type].description).toBeTruthy();
    }
  });
});
