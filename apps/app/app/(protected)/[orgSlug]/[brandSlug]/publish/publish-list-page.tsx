import { loadPostsPageData } from '@app-server/posts-page-data.server';
import {
  prefetchServerQuery,
  ServerQueryHydrationBoundary,
} from '@app-server/query-hydration.server';
import { PageScope } from '@genfeedai/enums';
import {
  normalizePostsPlatform,
  type PublisherPostsStatus,
} from '@helpers/content/posts.helper';
import PostsList from '@pages/posts/list/posts-list';
import {
  buildPostsListQueryKey,
  getDefaultPostsSort,
  type PostsPublicationState,
} from '@pages/posts/list/posts-list-query';

export type PostsListSearchParams = Promise<{
  page?: string;
  platform?: string;
  search?: string;
  sort?: string;
  status?: string;
}>;

export async function renderPostsListPage({
  searchParams,
  scope = PageScope.PUBLISHER,
  publicationStateOverride,
  statusOverride,
}: {
  searchParams: PostsListSearchParams;
  scope?: PageScope;
  publicationStateOverride?: PostsPublicationState;
  statusOverride?: PublisherPostsStatus;
}) {
  const { page, platform, search, sort } = await searchParams;
  // Publisher navigation is intentionally two-state: work that is not posted
  // yet and work that is already live. Individual draft/scheduled/processing
  // states remain visible on each card instead of becoming route-level tabs.
  const normalizedStatus = statusOverride;
  const publicationState =
    publicationStateOverride ??
    (scope === PageScope.PUBLISHER && !normalizedStatus
      ? 'not-posted'
      : undefined);
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
        publicationState={publicationState}
        scope={scope}
        status={normalizedStatus}
      />
    </ServerQueryHydrationBoundary>
  );
}
