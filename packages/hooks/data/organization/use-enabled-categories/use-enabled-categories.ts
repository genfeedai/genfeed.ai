import { IngredientCategory } from '@genfeedai/enums';
import type { IOrganizationSetting } from '@genfeedai/interfaces';
import { useOrganization } from '@hooks/data/organization/use-organization/use-organization';
import { useMemo } from 'react';

/**
 * Category routing configuration - single source of truth
 * for URL params ↔ IngredientCategory mappings
 */
export const STUDIO_CATEGORY_CONFIG = [
  {
    category: IngredientCategory.IMAGE,
    param: 'image',
    settingKey: 'isGenerateImagesEnabled' as const,
  },
  {
    category: IngredientCategory.VIDEO,
    param: 'video',
    settingKey: 'isGenerateVideosEnabled' as const,
  },
  {
    category: IngredientCategory.MUSIC,
    param: 'music',
    settingKey: 'isGenerateMusicEnabled' as const,
  },
  { category: IngredientCategory.AVATAR, param: 'avatar', settingKey: null }, // Always enabled
] as const;

type SettingKey =
  | 'isGenerateImagesEnabled'
  | 'isGenerateVideosEnabled'
  | 'isGenerateMusicEnabled';

/**
 * Get enabled categories based on organization settings
 */
export function getEnabledCategories(
  settings?: IOrganizationSetting | null,
): IngredientCategory[] {
  return STUDIO_CATEGORY_CONFIG.filter(({ settingKey }) => {
    if (!settingKey) {
      return true; // Avatar always enabled
    }
    return settings?.[settingKey as SettingKey] ?? true;
  }).map(({ category }) => category);
}

/**
 * Check if a specific category is enabled
 */
export function isCategoryEnabled(
  category: IngredientCategory,
  settings?: IOrganizationSetting | null,
): boolean {
  const config = STUDIO_CATEGORY_CONFIG.find((c) => c.category === category);
  if (!config) {
    return false;
  }
  if (!config.settingKey) {
    return true; // Avatar always enabled
  }
  return settings?.[config.settingKey as SettingKey] ?? true;
}

/**
 * Convert URL param to IngredientCategory
 */
export function paramToCategory(param: string | null): IngredientCategory {
  if (!param) {
    return IngredientCategory.IMAGE;
  }
  const normalized = param.toLowerCase().trim();
  const config = STUDIO_CATEGORY_CONFIG.find((c) => c.param === normalized);
  return config?.category ?? IngredientCategory.IMAGE;
}

/**
 * Convert IngredientCategory to URL param
 */
export function categoryToParam(category: IngredientCategory): string {
  const config = STUDIO_CATEGORY_CONFIG.find((c) => c.category === category);
  return config?.param ?? 'image';
}

export interface UseEnabledCategoriesReturn {
  /** All categories enabled for the organization */
  enabledCategories: IngredientCategory[];
  /** Check if a category is enabled */
  isEnabled: (category: IngredientCategory) => boolean;
  /** First enabled category (for fallback) */
  defaultCategory: IngredientCategory;
  /** Loading state from organization settings */
  isLoading: boolean;
}

/**
 * Hook to get enabled categories based on organization settings
 *
 * @example
 * const { enabledCategories, isEnabled, defaultCategory } = useEnabledCategories();
 *
 * // Check if video generation is enabled
 * if (isEnabled(IngredientCategory.VIDEO)) { ... }
 *
 * // Get all enabled categories for tabs
 * const tabs = enabledCategories.map(category => ({ id: category, ... }));
 */
export function useEnabledCategories(): UseEnabledCategoriesReturn {
  const { settings, isLoading } = useOrganization();

  const enabledCategories = useMemo(
    () => getEnabledCategories(settings),
    [settings],
  );

  const isEnabled = useMemo(
    () => (category: IngredientCategory) =>
      isCategoryEnabled(category, settings),
    [settings],
  );

  const defaultCategory = enabledCategories[0] ?? IngredientCategory.IMAGE;

  return {
    defaultCategory,
    enabledCategories,
    isEnabled,
    isLoading,
  };
}
