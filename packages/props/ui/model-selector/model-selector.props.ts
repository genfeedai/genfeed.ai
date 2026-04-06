import type { CostTier, ModelCategory, RouterPriority } from '@genfeedai/enums';
import type { IModel } from '@genfeedai/interfaces';
import type { ReactNode, RefObject } from 'react';
import type { IconType } from 'react-icons';

export interface ModelSelectorOption {
  model: IModel;
  brandSlug: string;
  brandLabel: string;
  brandColor: string;
  brandIcon?: IconType;
  costTier?: CostTier;
  familyKey: string;
  familyLabel: string;
  variantLabel: string;
  isFavorite: boolean;
  isDeprecated: boolean;
  sourceGroup?: string;
}

export interface ModelSelectorPopoverProps {
  models: IModel[];
  values: string[];
  onChange: (name: string, values: string[]) => void;
  autoLabel?: string;
  prioritize?: RouterPriority;
  onPrioritizeChange?: (prioritize: RouterPriority) => void;
  currentModelCategory?: ModelCategory | null;
  watchedFormat?: string;
  favoriteModelKeys: string[];
  onFavoriteToggle: (modelKey: string) => void;
  className?: string;
  shouldFlash?: boolean;
  buttonRef?: RefObject<HTMLButtonElement | null>;
  icon?: ReactNode;
  placeholder?: string;
  name?: string;
  sourceGroupResolver?: (model: IModel) => string | undefined;
  sourceGroupLabels?: Record<string, string>;
  autoSourceGroups?: string[];
}

export interface ModelSelectorProviderSidebarProps {
  brands: Array<{
    slug: string;
    label: string;
    color: string;
    count: number;
  }>;
  activeBrand: string | null;
  onBrandSelect: (brand: string | null) => void;
  hasFavorites: boolean;
}

export interface ModelSelectorModelItemProps {
  option: ModelSelectorOption;
  isSelected: boolean;
  onToggle: (modelKey: string) => void;
  onFavoriteToggle: (modelKey: string) => void;
}

export interface ModelSelectorFamilyItemProps {
  brandColor: string;
  brandIcon?: IconType;
  brandLabel: string;
  count: number;
  familyLabel: string;
  isExpanded: boolean;
  onToggle: () => void;
}

export interface ModelSelectorTriggerProps {
  selectedModels: IModel[];
  isOpen: boolean;
  shouldFlash?: boolean;
  className?: string;
  autoLabel?: string;
}

export interface ModelSelectorCostBadgeProps {
  costTier?: CostTier;
}
