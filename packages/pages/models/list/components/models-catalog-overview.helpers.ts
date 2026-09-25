import { ModelCategory, ModelLifecycle } from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
import type { IconType } from '@genfeedai/contracts/interfaces/ui/icon.interface';
import { getModelCategoryBadgeClass } from '@genfeedai/helpers/ui/model-badge.helper';
import { Braces, FileText, Film, Image, Mic2, Music } from 'lucide-react';

export { getModelCategoryBadgeClass };

export type ModelCatalogOverviewCard = {
  cardClassName?: string;
  count: number;
  description: string;
  icon: IconType;
  iconClassName: string;
  label: string;
};

type ModelCategoryGroup = {
  categories: ModelCategory[];
  icon: IconType;
  iconClassName: string;
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
    label: 'Video',
    routeCategory: 'video',
  },
  {
    categories: [ModelCategory.MUSIC],
    icon: Music as IconType,
    iconClassName:
      '[background-color:color-mix(in_srgb,var(--accent-orange)_15%,transparent)] text-[var(--accent-orange)]',
    label: 'Music',
    routeCategory: 'music',
  },
  {
    categories: [ModelCategory.VOICE],
    icon: Mic2 as IconType,
    iconClassName:
      '[background-color:color-mix(in_srgb,var(--accent-pink)_15%,transparent)] text-[var(--accent-pink)]',
    label: 'Voice',
    routeCategory: 'other',
  },
  {
    categories: [ModelCategory.TEXT],
    icon: FileText as IconType,
    iconClassName: 'bg-success/15 text-success',
    label: 'Text',
    routeCategory: 'text',
  },
  {
    categories: [ModelCategory.EMBEDDING],
    icon: Braces as IconType,
    iconClassName:
      '[background-color:color-mix(in_srgb,var(--accent-rose)_15%,transparent)] text-[var(--accent-rose)]',
    label: 'Embedding',
    routeCategory: 'other',
  },
];

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
    const isActive =
      activeCategory === 'all' ||
      activeCategory === 'active' ||
      activeCategory === group.routeCategory;

    return {
      cardClassName: isActive ? undefined : 'opacity-50',
      count: groupModels.length,
      description: defaultModel
        ? `Default: ${defaultModel.label}`
        : 'No default selected',
      icon: group.icon,
      iconClassName: group.iconClassName,
      label: group.label,
    };
  });
}
