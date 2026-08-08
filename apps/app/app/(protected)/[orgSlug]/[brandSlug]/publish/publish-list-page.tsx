import { loadPostsPageData } from '@app-server/posts-page-data.server';
import {
  prefetchServerQuery,
  ServerQueryHydrationBoundary,
} from '@app-server/query-hydration.server';
import { loadReleasePostsPageData } from '@app-server/release-posts-page-data.server';
import { PageScope, PostStatus, TargetExecutionState } from '@genfeedai/enums';
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
import ReleasePostsList from '@pages/posts/list/release-posts-list';
import {
  buildReleasePostsListQueryKey,
  normalizeReleasePostContentTypes,
  normalizeReleasePostsSort,
} from '@pages/posts/list/release-posts-list-query';

export type PostsListSearchParams = Promise<{
  contentType?: string | string[];
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
  showAllPublicationStates = false,
}: {
  searchParams: PostsListSearchParams;
  scope?: PageScope;
  publicationStateOverride?: PostsPublicationState;
  statusOverride?: PublisherPostsStatus;
  /** True for the canonical `/publish/posts` library (no lifecycle filter). */
  showAllPublicationStates?: boolean;
}) {
  const { contentType, page, platform, search, sort } = await searchParams;
  // Pipeline shortcuts (Drafts / Published / Failed) pass a focused override.
  // The Posts library shows every lifecycle state and filters in the table.
  const normalizedStatus = statusOverride;
  const publicationState = showAllPublicationStates
    ? undefined
    : (publicationStateOverride ??
      (scope === PageScope.PUBLISHER && !normalizedStatus
        ? 'not-posted'
        : undefined));
  const parsedPage = Math.floor(Number.parseInt(page ?? '1', 10));
  const currentPage = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1;
  const normalizedPlatform = normalizePostsPlatform(platform);
  const platformFilter =
    normalizedPlatform !== 'all' ? normalizedPlatform : undefined;

  if (scope !== PageScope.SUPERADMIN) {
    const canonicalPublicationState = showAllPublicationStates
      ? undefined
      : (publicationStateOverride ??
        (normalizedStatus === PostStatus.PUBLIC
          ? 'posted'
          : scope === PageScope.PUBLISHER && !normalizedStatus
            ? 'not-posted'
            : undefined));
    const executionStates =
      normalizedStatus === PostStatus.FAILED
        ? [TargetExecutionState.FAILED]
        : normalizedStatus === PostStatus.SCHEDULED &&
            !canonicalPublicationState
          ? [TargetExecutionState.SCHEDULED]
          : normalizedStatus === PostStatus.DRAFT && !canonicalPublicationState
            ? [TargetExecutionState.DRAFT]
            : undefined;
    const canonicalSort = normalizeReleasePostsSort(sort);
    const contentTypes = normalizeReleasePostContentTypes(contentType);
    const initialData = await loadReleasePostsPageData({
      contentTypes,
      currentPage,
      executionStates,
      platform: platformFilter,
      publicationState: canonicalPublicationState,
      scope,
      search,
      sort: canonicalSort,
    });
    const initialReleaseResult = {
      pagination: initialData.pagination,
      releases: initialData.releases,
    };

    await prefetchServerQuery({
      queryFn: () => initialReleaseResult,
      queryKey: buildReleasePostsListQueryKey({
        brandId: initialData.brandId,
        contentTypes,
        currentPage,
        executionStates,
        organizationId: initialData.organizationId,
        platform: platformFilter,
        publicationState: canonicalPublicationState,
        scope,
        search: search ?? '',
        sort: canonicalSort,
      }),
    });

    return (
      <ServerQueryHydrationBoundary>
        <ReleasePostsList
          contentTypes={contentTypes}
          executionStates={executionStates}
          initialPagination={initialData.pagination}
          initialReleases={initialData.releases}
          platform={normalizedPlatform}
          publicationState={canonicalPublicationState}
          scope={scope}
          search={search ?? ''}
          sort={canonicalSort}
        />
      </ServerQueryHydrationBoundary>
    );
  }

  const initialData = await loadPostsPageData({
    currentPage,
    platformFilter,
    publicationState,
    scope,
    search,
    sort,
    status: normalizedStatus,
  });
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
        publicationState={showAllPublicationStates ? null : publicationState}
        scope={scope}
        status={normalizedStatus}
      />
    </ServerQueryHydrationBoundary>
  );
}
