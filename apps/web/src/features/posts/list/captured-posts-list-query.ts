import {
  type CredentialPlatform,
  type PageScope,
  PostCategory,
  TargetExecutionState,
} from '@genfeedai/contracts';
import {
  POSTS_SOURCE_EXTENSION,
  type PostsSourceFilter,
} from './posts-list-query';
import {
  RELEASE_POSTS_SORT_OPTIONS,
  type ReleasePostsPublicationState,
  type ReleasePostsSort,
} from './release-posts-list-query';

/**
 * Captured publications were observed after the fact, so they have no
 * scheduled date: only creation-time orderings are meaningful for them.
 */
export type CapturedPostsSort = Extract<
  ReleasePostsSort,
  'createdAt: -1' | 'createdAt: 1'
>;

const DEFAULT_CAPTURED_POSTS_SORT: CapturedPostsSort = 'createdAt: -1';

export function isCapturedPostsSort(
  value: ReleasePostsSort,
): value is CapturedPostsSort {
  return value === 'createdAt: -1' || value === 'createdAt: 1';
}

export const CAPTURED_POSTS_SORT_OPTIONS: Array<{
  label: string;
  value: CapturedPostsSort;
}> = RELEASE_POSTS_SORT_OPTIONS.flatMap(({ label, value }) =>
  isCapturedPostsSort(value) ? [{ label, value }] : [],
);

export function normalizeCapturedPostsSort(
  value: ReleasePostsSort,
): CapturedPostsSort {
  return isCapturedPostsSort(value) ? value : DEFAULT_CAPTURED_POSTS_SORT;
}

export interface CapturedPostsQueryInput {
  brandId?: string;
  campaignId?: string;
  contentTypes?: PostCategory[];
  executionStates?: TargetExecutionState[];
  limit: number;
  organizationId: string;
  page: number;
  platform?: CredentialPlatform;
  publicationState?: ReleasePostsPublicationState;
  search: string;
  sort: ReleasePostsSort;
}

/** Query accepted by `GET /posts` (`PostsQueryDto`), always source-filtered. */
export type CapturedPostsApiQuery = {
  brandId?: string;
  campaignId?: string;
  limit: number;
  organizationId: string;
  page: number;
  platform?: CredentialPlatform;
  search?: string;
  sort: CapturedPostsSort;
  source: PostsSourceFilter;
};

/**
 * Maps the Publish filters onto the posts API. Every captured publication is
 * already published, so a lifecycle filter that includes the published state
 * adds no constraint, and one that excludes it can match nothing (likewise a
 * content-type filter without text): return `null` rather than ask the API a
 * question whose answer is known.
 */
export function buildCapturedPostsQuery({
  brandId,
  campaignId,
  contentTypes,
  executionStates,
  limit,
  organizationId,
  page,
  platform,
  publicationState,
  search,
  sort,
}: CapturedPostsQueryInput): CapturedPostsApiQuery | null {
  if (publicationState === 'not-posted') {
    return null;
  }
  if (
    executionStates?.length &&
    !executionStates.includes(TargetExecutionState.PUBLISHED)
  ) {
    return null;
  }
  // The extension records the text of a publication, never typed media.
  if (contentTypes?.length && !contentTypes.includes(PostCategory.TEXT)) {
    return null;
  }

  return {
    ...(brandId ? { brandId } : {}),
    ...(campaignId ? { campaignId } : {}),
    limit,
    organizationId,
    page,
    ...(platform ? { platform } : {}),
    ...(search ? { search } : {}),
    sort: normalizeCapturedPostsSort(sort),
    source: POSTS_SOURCE_EXTENSION,
  };
}

export interface CapturedPostsListQueryKeyInput {
  brandId?: string | null;
  campaignId?: string;
  contentTypes?: PostCategory[];
  currentPage: number;
  organizationId?: string | null;
  platform?: string;
  scope: PageScope;
  search: string;
  sort: ReleasePostsSort;
}

export function buildCapturedPostsListQueryKey({
  brandId,
  campaignId,
  contentTypes,
  currentPage,
  organizationId,
  platform,
  scope,
  search,
  sort,
}: CapturedPostsListQueryKeyInput) {
  return [
    'publish-captured-list',
    POSTS_SOURCE_EXTENSION,
    scope,
    organizationId,
    brandId,
    campaignId,
    contentTypes?.join(','),
    platform,
    search,
    normalizeCapturedPostsSort(sort),
    currentPage,
  ] as const;
}
