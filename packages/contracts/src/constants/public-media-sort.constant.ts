/** How the community gallery orders public images and videos. */
export const PUBLIC_MEDIA_SORTS = ['newest', 'views', 'recreations'] as const;

export type PublicMediaSort = (typeof PUBLIC_MEDIA_SORTS)[number];

export const DEFAULT_PUBLIC_MEDIA_SORT: PublicMediaSort = 'newest';

/** The menu label of each order. */
export const PUBLIC_MEDIA_SORT_LABELS: Record<PublicMediaSort, string> = {
  newest: 'Newest',
  recreations: 'Most recreated',
  views: 'Most viewed',
};

/** Reads a `sortBy` query value; anything unknown is the newest first. */
export function parsePublicMediaSort(value?: string | null): PublicMediaSort {
  return (
    PUBLIC_MEDIA_SORTS.find((sort) => sort === value) ??
    DEFAULT_PUBLIC_MEDIA_SORT
  );
}
