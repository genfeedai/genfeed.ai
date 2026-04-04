import { IngredientCategory } from '@genfeedai/enums';
import {
  categoryToParam,
  getEnabledCategories,
  isCategoryEnabled,
  paramToCategory,
  useEnabledCategories,
} from '@hooks/data/organization/use-enabled-categories/use-enabled-categories';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@hooks/data/organization/use-organization/use-organization', () => ({
  useOrganization: vi.fn(() => ({
    isLoading: false,
    settings: {
      isGenerateImagesEnabled: true,
      isGenerateMusicEnabled: false,
      isGenerateVideosEnabled: true,
    },
  })),
}));

describe('getEnabledCategories', () => {
  it('returns all categories when settings enable everything', () => {
    const settings = {
      isGenerateImagesEnabled: true,
      isGenerateMusicEnabled: true,
      isGenerateVideosEnabled: true,
    };
    const categories = getEnabledCategories(settings as never);
    expect(categories).toContain(IngredientCategory.IMAGE);
    expect(categories).toContain(IngredientCategory.VIDEO);
    expect(categories).toContain(IngredientCategory.MUSIC);
    expect(categories).toContain(IngredientCategory.AVATAR);
  });

  it('excludes music when isGenerateMusicEnabled is false', () => {
    const settings = {
      isGenerateImagesEnabled: true,
      isGenerateMusicEnabled: false,
      isGenerateVideosEnabled: true,
    };
    const categories = getEnabledCategories(settings as never);
    expect(categories).not.toContain(IngredientCategory.MUSIC);
    expect(categories).toContain(IngredientCategory.AVATAR);
  });

  it('always includes AVATAR category (null settingKey)', () => {
    const categories = getEnabledCategories(null);
    expect(categories).toContain(IngredientCategory.AVATAR);
  });

  it('defaults to enabled when settings are null', () => {
    const categories = getEnabledCategories(null);
    expect(categories).toContain(IngredientCategory.IMAGE);
  });
});

describe('isCategoryEnabled', () => {
  it('returns true for AVATAR regardless of settings', () => {
    expect(
      isCategoryEnabled(IngredientCategory.AVATAR, {
        isGenerateImagesEnabled: false,
      } as never),
    ).toBe(true);
  });

  it('returns false for IMAGE when disabled', () => {
    expect(
      isCategoryEnabled(IngredientCategory.IMAGE, {
        isGenerateImagesEnabled: false,
      } as never),
    ).toBe(false);
  });

  it('returns true for unknown category', () => {
    // Unknown categories return false (not found in config)
    expect(isCategoryEnabled('unknown' as IngredientCategory, null)).toBe(
      false,
    );
  });
});

describe('paramToCategory', () => {
  it('converts "image" to IMAGE', () => {
    expect(paramToCategory('image')).toBe(IngredientCategory.IMAGE);
  });

  it('converts "video" to VIDEO', () => {
    expect(paramToCategory('video')).toBe(IngredientCategory.VIDEO);
  });

  it('converts "music" to MUSIC', () => {
    expect(paramToCategory('music')).toBe(IngredientCategory.MUSIC);
  });

  it('returns IMAGE for null param', () => {
    expect(paramToCategory(null)).toBe(IngredientCategory.IMAGE);
  });

  it('returns IMAGE for unknown param', () => {
    expect(paramToCategory('unknown')).toBe(IngredientCategory.IMAGE);
  });
});

describe('categoryToParam', () => {
  it('converts IMAGE to "image"', () => {
    expect(categoryToParam(IngredientCategory.IMAGE)).toBe('image');
  });

  it('converts VIDEO to "video"', () => {
    expect(categoryToParam(IngredientCategory.VIDEO)).toBe('video');
  });

  it('returns "image" for unknown category', () => {
    expect(categoryToParam('unknown' as IngredientCategory)).toBe('image');
  });
});

describe('useEnabledCategories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns enabledCategories array', () => {
    const { result } = renderHook(() => useEnabledCategories());
    expect(Array.isArray(result.current.enabledCategories)).toBe(true);
    expect(result.current.enabledCategories).toContain(
      IngredientCategory.IMAGE,
    );
    expect(result.current.enabledCategories).not.toContain(
      IngredientCategory.MUSIC,
    );
  });

  it('returns isEnabled function', () => {
    const { result } = renderHook(() => useEnabledCategories());
    expect(typeof result.current.isEnabled).toBe('function');
    expect(result.current.isEnabled(IngredientCategory.IMAGE)).toBe(true);
    expect(result.current.isEnabled(IngredientCategory.MUSIC)).toBe(false);
  });

  it('returns defaultCategory as first enabled category', () => {
    const { result } = renderHook(() => useEnabledCategories());
    expect(result.current.defaultCategory).toBe(IngredientCategory.IMAGE);
  });

  it('returns isLoading from useOrganization', () => {
    const { result } = renderHook(() => useEnabledCategories());
    expect(result.current.isLoading).toBe(false);
  });
});
