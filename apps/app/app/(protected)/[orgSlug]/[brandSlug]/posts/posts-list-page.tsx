import { loadPostsPageData } from '@app-server/posts-page-data.server';
import {
  prefetchServerQuery,
  ServerQueryHydrationBoundary,
} from '@app-server/query-hydration.server';
import { PageScope, PostStatus } from '@genfeedai/enums';
import {
  normalizePostsPlatform,
  type PublisherPostsStatus,
} from '@helpers/content/posts.helper';
import PostsList from '@pages/posts/list/posts-list';
import {
  buildPostsListQueryKey,
  getDefaultPostsSort,
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
  statusOverride,
}: {
  searchParams: PostsListSearchParams;
  scope?: PageScope;
  statusOverride?: PublisherPostsStatus;
}) {
  const { page, platform, search, sort } = await searchParams;
  // `status` no longer comes from the query string — nested routes
  // (/posts/scheduled, /posts/published) pass `statusOverride`, and the /posts
  // index is always the Drafts view. Legacy `?status=` links are redirected to
  // their canonical path in page.tsx.
  const normalizedStatus = statusOverride ?? PostStatus.DRAFT;
  const parsedPage = Math.floor(Number.parseInt(page ?? '1', 10));
  const currentPage = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1;
  const normalizedPlatform = normalizePostsPlatform(platform);
  const initialData = await loadPostsPageData({
    currentPage,
    platformFilter:
      normalizedPlatform !== 'all' ? normalizedPlatform : undefined,
    scope,
    search,
    sort,
    status: normalizedStatus,
  });
  const platformFilter =
    normalizedPlatform !== 'all' ? normalizedPlatform : undefined;
  const filterSort = sort || getDefaultPostsSort(normalizedStatus);

  await prefetchServerQuery({
    queryFn: () => initialData.posts,
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
      scope,
      status: normalizedStatus,
    }),
  });

  return (
    <ServerQueryHydrationBoundary>
      <PostsList
        initialPostPresets={initialData.postPresets}
        initialPosts={initialData.posts}
        platform={normalizedPlatform}
        scope={scope}
        status={normalizedStatus}
      />
    </ServerQueryHydrationBoundary>
  );
}
