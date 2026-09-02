import { loadProtectedBootstrap } from '@app-server/protected-bootstrap.server';
import {
  prefetchServerQuery,
  ServerQueryHydrationBoundary,
} from '@app-server/query-hydration.server';
import { loadReleasePostsPageData } from '@app-server/release-posts-page-data.server';
import { PageScope, PostStatus, TargetExecutionState } from '@genfeedai/enums';
import { normalizePostsPlatform } from '@helpers/content/posts.helper';
import {
  parsePostsPublicationState,
  parsePostsStatus,
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
  publicationState?: string;
  search?: string;
  sort?: string;
  status?: string;
}>;

/**
 * The single Posts list. Every lifecycle state is a query-param filter
 * (`publicationState` / `status`, see `createPublishingPostsFilterRoute`);
 * no caller forces a lifecycle.
 */
export async function renderPostsListPage({
  searchParams,
  scope = PageScope.PUBLISHING,
}: {
  searchParams: PostsListSearchParams;
  scope?: PageScope;
}) {
  const [
    {
      contentType,
      page,
      platform,
      publicationState: publicationStateParam,
      search,
      sort,
      status,
    },
    bootstrap,
  ] = await Promise.all([searchParams, loadProtectedBootstrap()]);
  const normalizedStatus = parsePostsStatus(status);
  const requestedPublicationState = parsePostsPublicationState(
    publicationStateParam,
  );
  const parsedPage = Math.floor(Number.parseInt(page ?? '1', 10));
  const currentPage = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1;
  const normalizedPlatform = normalizePostsPlatform(platform);
  const platformFilter =
    normalizedPlatform !== 'all' ? normalizedPlatform : undefined;
  const brandId = bootstrap?.brandId ?? null;
  const organizationId = bootstrap?.organizationId ?? null;

  const canonicalPublicationState =
    requestedPublicationState ??
    (normalizedStatus === PostStatus.PUBLIC ? 'posted' : undefined);
  const executionStates =
    normalizedStatus === PostStatus.FAILED
      ? [TargetExecutionState.FAILED]
      : normalizedStatus === PostStatus.SCHEDULED && !canonicalPublicationState
        ? [TargetExecutionState.SCHEDULED]
        : normalizedStatus === PostStatus.DRAFT && !canonicalPublicationState
          ? [TargetExecutionState.DRAFT]
          : normalizedStatus === PostStatus.PENDING ||
              normalizedStatus === PostStatus.PROCESSING
            ? [TargetExecutionState.PUBLISHING]
            : undefined;
  const canonicalSort = normalizeReleasePostsSort(sort);
  const contentTypes = normalizeReleasePostContentTypes(contentType);
  // Start the query without awaiting it so the Publishing shell paints while
  // TanStack Query streams the pending result into the client boundary.
  prefetchServerQuery({
    queryFn: async () => {
      const pageData = await loadReleasePostsPageData({
        contentTypes,
        currentPage,
        executionStates,
        platform: platformFilter,
        publicationState: canonicalPublicationState,
        scope,
        search,
        sort: canonicalSort,
      });
      return {
        pagination: pageData.pagination,
        releases: pageData.releases,
      };
    },
    queryKey: buildReleasePostsListQueryKey({
      brandId,
      contentTypes,
      currentPage,
      executionStates,
      organizationId,
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
        platform={normalizedPlatform}
        publicationState={canonicalPublicationState}
        scope={scope}
        search={search ?? ''}
        sort={canonicalSort}
      />
    </ServerQueryHydrationBoundary>
  );
}
