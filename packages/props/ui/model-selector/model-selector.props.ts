import type { CostTier, ModelCategory, RouterPriority } from '@genfeedai/enums';
import type { IModel } from '@genfeedai/interfaces';
import type { IconType } from '@genfeedai/interfaces/ui/icon.interface';
import type { ReactNode, RefObject } from 'react';
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
  /**
   * `multi` (default) — studio/generation multi-pick with checkboxes.
   * `single` — chat/composer single pick; selecting a row replaces the value
   * and closes the popover. Hides Auto priority cards unless `autoLabel` is set.
   */
  selectionMode?: 'multi' | 'single';
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
  /** When true, trigger/open are blocked (busy composer, etc.). */
  isDisabled?: boolean;
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
  /** `single` uses a check mark instead of multi-select checkboxes. */
  selectionMode?: 'multi' | 'single';
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
  /** Auto is a pseudo-option with no IModel row — the trigger labels it itself. */
  isAutoSelected?: boolean;
  isOpen: boolean;
  shouldFlash?: boolean;
  className?: string;
  autoLabel?: string;
}

export interface ModelSelectorCostBadgeProps {
  costTier?: CostTier;
}
