import type {
  CollectionGridDensity,
  CollectionMaxColumns,
} from '@genfeedai/props/ui/collection/collection.props';

/**
 * Container-query column ladder. Columns resolve from the collection's own
 * width, never the viewport: the page column sits beside the app rail and
 * sidebar, so viewport breakpoints over-count the room a grid has.
 * 1 column below 40rem (640px), 2 from 40rem, 3 from 60rem (960px), 4 from
 * 80rem (1280px). Literal strings so Tailwind's scanner sees every class.
 */
export const COLLECTION_GRID_COLUMN_CLASSES: Record<
  CollectionMaxColumns,
  string
> = {
  2: 'grid-cols-1 @[40rem]:grid-cols-2',
  3: 'grid-cols-1 @[40rem]:grid-cols-2 @[60rem]:grid-cols-3',
  4: 'grid-cols-1 @[40rem]:grid-cols-2 @[60rem]:grid-cols-3 @[80rem]:grid-cols-4',
};

export const COLLECTION_GRID_GAP_CLASSES: Record<
  CollectionGridDensity,
  string
> = {
  card: 'gap-4',
  tile: 'gap-3',
};

export const COLLECTION_DEFAULT_SKELETON_COUNT = 6;
