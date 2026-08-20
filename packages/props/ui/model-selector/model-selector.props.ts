import type { CostTier, ModelCategory, RouterPriority } from '@genfeedai/enums';
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

/**
 * A single-select filter chip. `all` plus the catalog's source groups and the
 * capability shortcuts — the flat list has no rail and no accordion, so this
 * row is the only structural filter.
 */
export interface ModelSelectorFilter {
  id: string;
  label: string;
  icon?: IconType;
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
}

export interface ModelSelectorFilterPillsProps {
  filters: ModelSelectorFilter[];
  activeFilterId: string;
  onFilterSelect: (filterId: string) => void;
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
}

export interface ModelSelectorCostBadgeProps {
  costTier?: CostTier;
}
