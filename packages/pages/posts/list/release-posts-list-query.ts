import {
  type PageScope,
  PostCategory,
  type TargetExecutionState,
} from '@genfeedai/enums';

export type ReleasePostsPublicationState = 'posted' | 'not-posted';

export type ReleasePostsSort =
  | 'createdAt: -1'
  | 'createdAt: 1'
  | 'scheduledDate: -1'
  | 'scheduledDate: 1'
  | 'updatedAt: -1'
  | 'updatedAt: 1';

export interface ReleasePostsListQueryKeyInput {
  brandId?: string | null;
  contentTypes?: PostCategory[];
  credentialIds?: string[];
  currentPage: number;
  executionStates?: TargetExecutionState[];
  organizationId?: string | null;
  platform?: string;
  publicationState?: ReleasePostsPublicationState;
  scope: PageScope;
  search: string;
  sort: ReleasePostsSort;
}

export function buildReleasePostsListQueryKey({
  brandId,
  contentTypes,
  credentialIds,
  currentPage,
  executionStates,
  organizationId,
  platform,
  publicationState,
  scope,
  search,
  sort,
}: ReleasePostsListQueryKeyInput) {
  return [
    'publish-release-list',
    scope,
    organizationId,
    brandId,
    contentTypes?.join(','),
    publicationState,
    executionStates?.join(','),
    platform,
    search,
    sort,
    currentPage,
    credentialIds?.join(','),
  ] as const;
}

export const RELEASE_POSTS_SORT_OPTIONS: Array<{
  label: string;
  value: ReleasePostsSort;
}> = [
  { label: 'Newest First', value: 'createdAt: -1' },
  { label: 'Oldest First', value: 'createdAt: 1' },
  { label: 'Scheduled (Latest)', value: 'scheduledDate: -1' },
  { label: 'Scheduled (Earliest)', value: 'scheduledDate: 1' },
];

export function normalizeReleasePostsSort(value?: string): ReleasePostsSort {
  return (
    RELEASE_POSTS_SORT_OPTIONS.find((option) => option.value === value)
      ?.value ?? 'createdAt: -1'
  );
}

export function normalizeReleasePostContentTypes(
  value?: string | string[],
): PostCategory[] | undefined {
  const requested = Array.isArray(value) ? value : value ? [value] : [];
  const allowed = new Set<string>(Object.values(PostCategory));
  const normalized = [
    ...new Set(requested.filter((entry) => allowed.has(entry))),
  ] as PostCategory[];
  return normalized.length > 0 ? normalized : undefined;
}
