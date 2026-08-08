import { loadPostsPageData } from '@app-server/posts-page-data.server';
import {
  prefetchServerQuery,
  ServerQueryHydrationBoundary,
} from '@app-server/query-hydration.server';
import { PageScope, type PostStatus } from '@genfeedai/enums';
import { normalizePostsPlatform } from '@helpers/content/posts.helper';
import PostsList from '@pages/posts/list/posts-list';
import {
  buildPostsListQueryKey,
  getDefaultPostsSort,
  type PostsPublicationState,
  parsePostsPublicationState,
  parsePostsStatus,
} from '@pages/posts/list/posts-list-query';

export type PostsListSearchParams = Promise<{
  page?: string;
  platform?: string;
  publicationState?: string;
  search?: string;
  sort?: string;
  status?: string;
}>;

export async function renderPostsListPage({
  searchParams,
  scope = PageScope.PUBLISHER,
  publicationStateOverride,
  statusOverride,
  showAllPublicationStates = false,
}: {
  searchParams: PostsListSearchParams;
  scope?: PageScope;
  publicationStateOverride?: PostsPublicationState;
  statusOverride?: PostStatus;
  /** True for the canonical `/publish/posts` library (no lifecycle filter). */
  showAllPublicationStates?: boolean;
}) {
  const {
    page,
    platform,
    publicationState: publicationStateParam,
    search,
    sort,
    status,
  } = await searchParams;
  // Pipeline shortcuts (Drafts / Published / Failed) pass a focused override.
  // The Posts library shows every lifecycle state and filters in the table.
  const queryStatus = parsePostsStatus(status);
  const normalizedStatus = statusOverride ?? queryStatus;
  const requestedPublicationState = parsePostsPublicationState(
    publicationStateParam,
  );
  const publicationState = normalizedStatus
    ? undefined
    : (publicationStateOverride ??
      (showAllPublicationStates
        ? requestedPublicationState
        : scope === PageScope.PUBLISHER
          ? 'not-posted'
          : undefined));
  const parsedPage = Math.floor(Number.parseInt(page ?? '1', 10));
  const currentPage = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1;
  const normalizedPlatform = normalizePostsPlatform(platform);
  const initialData = await loadPostsPageData({
    currentPage,
    platformFilter:
      normalizedPlatform !== 'all' ? normalizedPlatform : undefined,
    publicationState,
    scope,
    search,
    sort,
    status: normalizedStatus,
  });
  const platformFilter =
    normalizedPlatform !== 'all' ? normalizedPlatform : undefined;
  const filterSort = sort || getDefaultPostsSort(normalizedStatus);
  const initialPostsResult = {
    pagination: initialData.pagination,
    posts: initialData.posts,
  };

  await prefetchServerQuery({
    queryFn: () => initialPostsResult,
    queryKey: buildPostsListQueryKey({
      adminBrand: '',
      adminOrg: '',
      brandId: initialData.brandId,
      currentPage,
      filterSearch: search || '',
      filterSort,
      filterStatus: normalizedStatus || '',
      organizationId: initialData.organizationId,
      platformFilter,
      publicationState,
      scope,
      status: normalizedStatus,
    }),
  });

  return (
    <ServerQueryHydrationBoundary>
      <PostsList
        initialPostPresets={initialData.postPresets}
        initialPosts={initialData.posts}
        initialPagination={initialData.pagination}
        platform={normalizedPlatform}
        publicationState={publicationState ?? null}
        scope={scope}
        status={normalizedStatus}
      />
    </ServerQueryHydrationBoundary>
  );
}
