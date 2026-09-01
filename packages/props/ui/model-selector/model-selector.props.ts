import type {
  CostTier,
  ModelCategory,
  ModelLifecycle,
  QualityTier,
  RouterPriority,
} from '@genfeedai/enums';
import type { IModel } from '@genfeedai/interfaces';
import type { IconType } from '@genfeedai/interfaces/ui/icon.interface';
import type { RefObject } from 'react';
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
  lifecycle: ModelLifecycle;
  sourceGroup?: string;
}

/**
 * One capability the row advertises with an icon and the spec panel spells out.
 * The icon carries the meaning on the row; `label` is its accessible name.
 */
export interface ModelSelectorCapability {
  id: string;
  label: string;
  icon: IconType;
}

/** A category or capability chip in the model picker's single filter row. */
export interface ModelSelectorFilter {
  id: string;
  label: string;
  icon?: IconType;
}

/** Optional generation kind shown inside the same picker as model routing. */
export interface ModelSelectorContextOption {
  description?: string;
  icon?: IconType;
  label: string;
  value: string;
}

export interface ModelSelectorPopoverProps {
  models: readonly IModel[];
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
  favoriteModelKeys: string[];
  onFavoriteToggle: (modelKey: string) => void;
  className?: string;
  shouldFlash?: boolean;
  buttonRef?: RefObject<HTMLButtonElement | null>;
  name?: string;
  sourceGroupResolver?: (model: IModel) => string | undefined;
  sourceGroupLabels?: Record<string, string>;
  autoSourceGroups?: string[];
  /** When true, trigger/open are blocked (busy composer, etc.). */
  isDisabled?: boolean;
  /**
   * When set, models whose `cost` exceeds this balance are not selectable
   * (credit lock). Null/undefined disables the lock.
   */
  creditsAvailable?: number | null;
  /** Groups generation kind and model routing behind one composer control. */
  contextLabel?: string;
  contextOptions?: readonly ModelSelectorContextOption[];
  contextValue?: string;
  onContextChange?: (value: string) => void;
}

export interface ModelSelectorFilterPillsProps {
  categoryFilters: ModelSelectorFilter[];
  activeCategoryId: string;
  onCategorySelect: (filterId: string) => void;
  capabilityFilters: ModelSelectorFilter[];
  activeCapabilityFilterId: string | null;
  onCapabilityFilterSelect: (filterId: string) => void;
}

export interface ModelSelectorModelItemProps {
  option: ModelSelectorOption;
  isSelected: boolean;
  onToggle: (modelKey: string) => void;
  onFavoriteToggle: (modelKey: string) => void;
  /** `single` uses a check mark instead of multi-select checkboxes. */
  selectionMode?: 'multi' | 'single';
  /** Credit lock — row is visible but not selectable. */
  isLocked?: boolean;
  lockReason?: string;
}

export interface ModelSelectorModelSpecProps {
  option: ModelSelectorOption;
  /** Rendered when the model is priced out of the current credit balance. */
  lockReason?: string;
}

export interface ModelSelectorBrandMarkProps {
  brandColor: string;
  brandIcon?: IconType;
  brandLabel: string;
  testId?: string;
}

export interface ModelSelectorTriggerProps {
  selectedModels: IModel[];
  /** Auto is a pseudo-option with no IModel row — the trigger labels it itself. */
  isAutoSelected?: boolean;
  isOpen: boolean;
  shouldFlash?: boolean;
  className?: string;
  autoLabel?: string;
  context?: ModelSelectorContextOption;
}

export interface ModelSelectorCostBadgeProps {
  costTier?: CostTier;
}

export interface ModelSelectorQualityBarProps {
  qualityTier?: QualityTier;
}
