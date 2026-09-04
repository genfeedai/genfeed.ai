import { ModelCategory } from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
import type { IconType } from '@genfeedai/contracts/interfaces/ui/icon.interface';
import { Braces, FileText, Film, Image, Mic2, Music } from 'lucide-react';

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

const MODEL_CATEGORY_BADGE_CLASSES: Record<ModelCategory, string> = {
  [ModelCategory.EMBEDDING]: 'bg-muted text-muted-foreground border-border',
  [ModelCategory.IMAGE]: 'bg-info/15 text-info border-info/30',
  [ModelCategory.IMAGE_EDIT]:
    '[background-color:color-mix(in_srgb,var(--accent-pink)_15%,transparent)] text-[var(--accent-pink)] [border-color:color-mix(in_srgb,var(--accent-pink)_30%,transparent)]',
  [ModelCategory.IMAGE_UPSCALE]:
    '[background-color:color-mix(in_srgb,var(--accent-rose)_15%,transparent)] text-[var(--accent-rose)] [border-color:color-mix(in_srgb,var(--accent-rose)_30%,transparent)]',
  [ModelCategory.MUSIC]: 'bg-warning/15 text-warning border-warning/30',
  [ModelCategory.TEXT]: 'bg-success/15 text-success border-success/30',
  [ModelCategory.VIDEO]:
    '[background-color:color-mix(in_srgb,var(--accent-violet)_15%,transparent)] text-[var(--accent-violet)] [border-color:color-mix(in_srgb,var(--accent-violet)_30%,transparent)]',
  [ModelCategory.VIDEO_EDIT]:
    '[background-color:color-mix(in_srgb,var(--accent-purple)_15%,transparent)] text-[var(--accent-purple)] [border-color:color-mix(in_srgb,var(--accent-purple)_30%,transparent)]',
  [ModelCategory.VIDEO_UPSCALE]: 'bg-primary/15 text-primary border-primary/30',
  [ModelCategory.VOICE]:
    '[background-color:color-mix(in_srgb,var(--accent-orange)_15%,transparent)] text-[var(--accent-orange)] [border-color:color-mix(in_srgb,var(--accent-orange)_30%,transparent)]',
};

export function getModelCategoryBadgeClass(category: ModelCategory): string {
  return (
    MODEL_CATEGORY_BADGE_CLASSES[category] ??
    'bg-muted text-muted-foreground border-border'
  );
}

function normalizeRouteCategory(category?: string): string {
  if (category === 'images') {
    return 'image';
  }
  if (category === 'videos') {
    return 'video';
  }
  return category ?? 'all';
}

export function buildModelCatalogOverviewCards(
  models: IModel[],
  selectedCategory?: string,
): ModelCatalogOverviewCard[] {
  const activeCategory = normalizeRouteCategory(selectedCategory);

  return MODEL_CATEGORY_GROUPS.map((group) => {
    const groupModels = models.filter((model) =>
      group.categories.includes(model.category),
    );
    const defaultModel = groupModels.find((model) => model.isDefault);
    const isActive =
      activeCategory === 'all' || activeCategory === group.routeCategory;

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
