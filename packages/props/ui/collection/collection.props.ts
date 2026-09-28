import type { ViewType } from '@genfeedai/contracts';
import type { ReactNode } from 'react';

/** Views a collection can switch between. Masonry stays a Library concern. */
export type CollectionViewType = ViewType.LIST | ViewType.GRID;

/** Upper bound of the container-query column ladder (1 → 2 → 3 → 4). */
export type CollectionMaxColumns = 2 | 3 | 4;

/** `card` walls space at gap-4, `tile` (stat tiles, type tiles) at gap-3. */
export type CollectionGridDensity = 'card' | 'tile';

export interface CollectionSectionProps {
  /** Section heading. Rendered as an h2 so sections are page landmarks. */
  title: ReactNode;
  description?: ReactNode;
  /** Trailing header slot — a "View all" link or a section-level action. */
  actions?: ReactNode;
  /**
   * Number of items the section would render. `0` hides the whole section,
   * heading included, unless it is loading or carries an error.
   */
  itemCount?: number;
  /** Shows the count beside the title. */
  isCountVisible?: boolean;
  isLoading?: boolean;
  /** Section-scoped failure. Replaces the body; sibling sections keep rendering. */
  error?: ReactNode;
  /** Sticks the header under the topbar inside the content-panel scroll. */
  isHeaderSticky?: boolean;
  className?: string;
  children?: ReactNode;
  'data-testid'?: string;
}

export interface CollectionGridProps {
  maxColumns?: CollectionMaxColumns;
  density?: CollectionGridDensity;
  className?: string;
  children: ReactNode;
  'data-testid'?: string;
}

export interface CollectionListProps {
  className?: string;
  children: ReactNode;
  'data-testid'?: string;
}

export interface CollectionViewProps<TItem> {
  items: readonly TItem[];
  view: CollectionViewType;
  getItemKey: (item: TItem) => string;
  /** One row per item; rows render inside a single bordered list surface. */
  renderListItem: (item: TItem, index: number) => ReactNode;
  /** One card per item; cards render inside the container-query grid. */
  renderGridItem: (item: TItem, index: number) => ReactNode;
  maxColumns?: CollectionMaxColumns;
  density?: CollectionGridDensity;
  isLoading?: boolean;
  /** Skeleton rows or cards shown while loading. */
  skeletonCount?: number;
  /** Rendered when not loading and `items` is empty. */
  emptyState?: ReactNode;
  className?: string;
  'data-testid'?: string;
}

export interface CollectionFilterChip {
  id: string;
  label: ReactNode;
  onRemove: () => void;
}

export interface CollectionToolbarProps {
  /** Search input slot. */
  search?: ReactNode;
  /** Type / Category dropdowns. Never a filter sidebar. */
  filters?: ReactNode;
  /** Sort control slot. */
  sort?: ReactNode;
  view?: CollectionViewType;
  onViewChange?: (view: CollectionViewType) => void;
  /** Active filters, shown as removable chips beneath the row. */
  chips?: CollectionFilterChip[];
  onClearChips?: () => void;
  className?: string;
}

export interface CollectionOverflowAction {
  id: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  isDestructive?: boolean;
  isDisabled?: boolean;
}

export interface CollectionItemActionsProps {
  /** The single visible action. */
  primary?: ReactNode;
  /** Every other action, destructive ones included. */
  overflow?: CollectionOverflowAction[];
  /** Accessible name of the overflow trigger. Defaults to the localized "More actions". */
  overflowLabel?: string;
  className?: string;
}
