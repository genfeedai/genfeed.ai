import type { ReactNode } from 'react';

export interface LibraryGridItem {
  id: string;
  title: string;
  /** Short type label shown under the title, for example "image". */
  kind: string;
  thumbnailUrl?: string | null;
  /** Width over height of the media. A tile without one is square. */
  aspectRatio?: number;
}

export interface LibraryGridProps {
  /** Accessible name of the list of tiles. */
  ariaLabel: string;
  items: readonly LibraryGridItem[];
  /** Largest number of columns; the grid also adapts to the width it has. */
  maxColumns?: number;
  /** A selected tile ignores clicks, for a picker that attaches each asset once. */
  isSelectedLocked?: boolean;
  selectedIds?: ReadonlySet<string>;
  /** Accessible name of one tile. Defaults to the item title. */
  getItemAriaLabel?: (item: LibraryGridItem) => string;
  /** Replaces the thumbnail of a tile, for example with a video preview. */
  renderPreview?: (item: LibraryGridItem) => ReactNode;
  onSelect: (item: LibraryGridItem) => void;
}

export interface LibraryPickerProps
  extends Pick<
    LibraryGridProps,
    | 'getItemAriaLabel'
    | 'isSelectedLocked'
    | 'items'
    | 'onSelect'
    | 'renderPreview'
    | 'selectedIds'
  > {
  isOpen: boolean;
  isLoading?: boolean;
  title: string;
  description: string;
  /** What the grid is called to assistive technology. */
  gridLabel: string;
  /** What the spinner is called while `isLoading`. */
  loadingLabel: string;
  searchLabel: string;
  searchPlaceholder: string;
  query: string;
  /** Text shown when `items` is empty. */
  emptyLabel: string;
  /** The Filters menu, attached inside the search field. */
  filters?: ReactNode;
  /** A section above the search, for example the brand knowledge. */
  topSection?: ReactNode;
  footer?: ReactNode;
  onOpenChange: (open: boolean) => void;
  onQueryChange: (query: string) => void;
}
