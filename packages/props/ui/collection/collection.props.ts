import type { ViewType } from '@genfeedai/contracts';
import type { ReactNode } from 'react';

/** Views a collection can switch between. Masonry stays a Library concern. */
export type CollectionViewType = ViewType.LIST | ViewType.GRID;

/** Upper bound of the container-query column ladder (1 → 2 → 3 → 4). */
export type CollectionMaxColumns = 2 | 3 | 4;

/** `card` walls space at gap-4, `tile` (stat tiles, type tiles) at gap-3. */
export type CollectionGridDensity = 'card' | 'tile';

export interface UseCollectionViewPreferenceOptions {
  /** Stable surface id, e.g. `automation.agents`. One preference per surface. */
  surface: string;
  /** List for text-first collections, grid for visual-first ones. */
  defaultView: CollectionViewType;
}

export interface UseCollectionViewPreferenceReturn {
  view: CollectionViewType;
  setView: (view: CollectionViewType) => void;
}

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

export interface CollectionCarouselSectionProps
  extends Omit<CollectionSectionProps, 'children'> {
  gap?: 'sm' | 'md' | 'lg';
  /** Rail items; each should be `shrink-0` with a fixed or clamped width. */
  children: ReactNode;
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

interface CollectionOverflowActionBase {
  id: string;
  label: string;
  icon?: ReactNode;
  isDestructive?: boolean;
  isDisabled?: boolean;
}

/** A command: runs `onSelect` in place (rename, pause, delete). */
export interface CollectionOverflowCommand
  extends CollectionOverflowActionBase {
  onSelect: () => void;
  href?: undefined;
}

/**
 * A destination: renders a real link, so Cmd/Ctrl-click, open-in-new-tab and
 * copy-link keep working. Every overflow item that navigates uses this form.
 */
export interface CollectionOverflowLink extends CollectionOverflowActionBase {
  href: string;
  /** Opens in a new tab with `rel="noopener noreferrer"`. */
  isExternal?: boolean;
  onSelect?: undefined;
}

export type CollectionOverflowAction =
  | CollectionOverflowCommand
  | CollectionOverflowLink;

export interface CollectionOverflowItemProps {
  action: CollectionOverflowAction;
  className?: string;
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
