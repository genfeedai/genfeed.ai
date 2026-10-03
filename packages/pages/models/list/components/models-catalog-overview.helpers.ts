import { ModelCategory, ModelLifecycle } from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
import type { IconType } from '@genfeedai/contracts/interfaces/ui/icon.interface';
import { getModelCategoryBadgeClass } from '@genfeedai/helpers/ui/model-badge.helper';
import { Braces, FileText, Film, Image, Mic2, Music } from 'lucide-react';

export { getModelCategoryBadgeClass };

export type ModelCategoryGroupKey =
  | 'image'
  | 'video'
  | 'music'
  | 'voice'
  | 'text'
  | 'embedding';

export type ModelCatalogOverviewCard = {
  count: number;
  description: string;
  icon: IconType;
  iconClassName: string;
  /** Selected as the current list filter (or every card when unfiltered). */
  isActive: boolean;
  key: ModelCategoryGroupKey;
  label: string;
};

type ModelCategoryGroup = {
  categories: ModelCategory[];
  icon: IconType;
  iconClassName: string;
  key: ModelCategoryGroupKey;
  label: string;
  routeCategory: string;
};

const MODEL_CATEGORY_GROUPS: ModelCategoryGroup[] = [
  {
    categories: [
      ModelCategory.IMAGE,
      ModelCategory.IMAGE_EDIT,
      ModelCategory.IMAGE_UPSCALE,
    ],
    icon: Image as IconType,
    iconClassName: 'bg-info/15 text-info',
    key: 'image',
    label: 'Image',
    routeCategory: 'image',
  },
  {
    categories: [
      ModelCategory.VIDEO,
      ModelCategory.VIDEO_EDIT,
      ModelCategory.VIDEO_UPSCALE,
    ],
    icon: Film as IconType,
    iconClassName:
      '[background-color:color-mix(in_srgb,var(--accent-violet)_15%,transparent)] text-[var(--accent-violet)]',
    key: 'video',
    label: 'Video',
    routeCategory: 'video',
  },
  {
    categories: [ModelCategory.MUSIC],
    icon: Music as IconType,
    iconClassName:
      '[background-color:color-mix(in_srgb,var(--accent-orange)_15%,transparent)] text-[var(--accent-orange)]',
    key: 'music',
    label: 'Music',
    routeCategory: 'music',
  },
  {
    categories: [ModelCategory.VOICE],
    icon: Mic2 as IconType,
    iconClassName:
      '[background-color:color-mix(in_srgb,var(--accent-pink)_15%,transparent)] text-[var(--accent-pink)]',
    key: 'voice',
    label: 'Voice',
    routeCategory: 'other',
  },
  {
    categories: [ModelCategory.TEXT],
    icon: FileText as IconType,
    iconClassName: 'bg-success/15 text-success',
    key: 'text',
    label: 'Text',
    routeCategory: 'text',
  },
  {
    categories: [ModelCategory.EMBEDDING],
    icon: Braces as IconType,
    iconClassName:
      '[background-color:color-mix(in_srgb,var(--accent-rose)_15%,transparent)] text-[var(--accent-rose)]',
    key: 'embedding',
    label: 'Embedding',
    routeCategory: 'other',
  },
];

const MODEL_CATEGORY_GROUP_KEYS = new Set<string>(
  MODEL_CATEGORY_GROUPS.map((group) => group.key),
);

/**
 * The catalog group a list filter value selects. Accepts the group keys and the
 * legacy plural route values (`images`, `videos`); anything else is unfiltered.
 */
export function resolveModelCategoryGroupKey(
  value?: string | null,
): ModelCategoryGroupKey | null {
  const normalized =
    value === 'images' ? 'image' : value === 'videos' ? 'video' : value;
  return normalized && MODEL_CATEGORY_GROUP_KEYS.has(normalized)
    ? (normalized as ModelCategoryGroupKey)
    : null;
}

/** Every exact model category a catalog group spans. */
export function getModelCategoryGroupCategories(
  key: ModelCategoryGroupKey,
): ModelCategory[] {
  return (
    MODEL_CATEGORY_GROUPS.find((group) => group.key === key)?.categories ?? []
  );
}

function normalizeRouteCategory(category?: string): string {
  if (category === 'images') {
    return 'image';
  }
  if (category === 'videos') {
    return 'video';
  }
  return category ?? 'active';
}

export function buildModelCatalogOverviewCards(
  models: IModel[],
  selectedCategory?: string,
): ModelCatalogOverviewCard[] {
  const activeCategory = normalizeRouteCategory(selectedCategory);
  const catalogModels =
    activeCategory === 'all'
      ? models
      : models.filter((model) => model.lifecycle !== ModelLifecycle.RETIRED);

  return MODEL_CATEGORY_GROUPS.map((group) => {
    const groupModels = catalogModels.filter((model) =>
      group.categories.includes(model.category),
    );
    const defaultModel = groupModels.find((model) => model.isDefault);
    const selectedGroupKey = resolveModelCategoryGroupKey(selectedCategory);
    const isActive = selectedGroupKey
      ? selectedGroupKey === group.key
      : activeCategory === 'all' ||
        activeCategory === 'active' ||
        activeCategory === group.routeCategory;

    return {
      count: groupModels.length,
      description: defaultModel
        ? `Default: ${defaultModel.label}`
        : 'No default selected',
      icon: group.icon,
      iconClassName: group.iconClassName,
      isActive,
      key: group.key,
      label: group.label,
    };
  });
}
