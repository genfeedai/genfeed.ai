import { loadPostsPageData } from '@app-server/posts-page-data.server';
import { loadProtectedBootstrap } from '@app-server/protected-bootstrap.server';
import {
  prefetchServerQuery,
  ServerQueryHydrationBoundary,
} from '@app-server/query-hydration.server';
import { loadReleasePostsPageData } from '@app-server/release-posts-page-data.server';
import { PageScope, PostStatus, TargetExecutionState } from '@genfeedai/enums';
import { normalizePostsPlatform } from '@helpers/content/posts.helper';
import {
  buildPostsListQueryKey,
  getDefaultPostsSort,
  type PostsPublicationState,
  parsePostsPublicationState,
  parsePostsStatus,
} from '@pages/posts/list/posts-list-query';
import ReleasePostsList from '@pages/posts/list/release-posts-list';
import {
  buildReleasePostsListQueryKey,
  normalizeReleasePostContentTypes,
  normalizeReleasePostsSort,
} from '@pages/posts/list/release-posts-list-query';
import PublishingPostsList from './publishing-posts-list';

export type PostsListSearchParams = Promise<{
  contentType?: string | string[];
  page?: string;
  platform?: string;
  publicationState?: string;
  search?: string;
  sort?: string;
  status?: string;
}>;

export async function renderPostsListPage({
  searchParams,
  scope = PageScope.PUBLISHING,
  publicationStateOverride,
  statusOverride,
  showAllPublicationStates = false,
}: {
  searchParams: PostsListSearchParams;
  scope?: PageScope;
  publicationStateOverride?: PostsPublicationState;
  statusOverride?: PostStatus;
  /** True for the canonical `/publishing/posts` library (no lifecycle filter). */
  showAllPublicationStates?: boolean;
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
        : scope === PageScope.PUBLISHING
          ? 'not-posted'
          : undefined));
  const parsedPage = Math.floor(Number.parseInt(page ?? '1', 10));
  const currentPage = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1;
  const normalizedPlatform = normalizePostsPlatform(platform);
  const platformFilter =
    normalizedPlatform !== 'all' ? normalizedPlatform : undefined;
  const brandId = bootstrap?.brandId ?? null;
  const organizationId = bootstrap?.organizationId ?? null;

  if (scope !== PageScope.SUPERADMIN) {
    const canonicalPublicationState = showAllPublicationStates
      ? requestedPublicationState
      : (publicationStateOverride ??
        (normalizedStatus === PostStatus.PUBLIC
          ? 'posted'
          : scope === PageScope.PUBLISHING && !normalizedStatus
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

  const filterSort = sort || getDefaultPostsSort(normalizedStatus);

  prefetchServerQuery({
    queryFn: async () => {
      const pageData = await loadPostsPageData({
        currentPage,
        platformFilter,
        publicationState,
        scope,
        search,
        sort,
        status: normalizedStatus,
      });
      return {
        pagination: pageData.pagination,
        posts: pageData.posts,
      };
    },
    queryKey: buildPostsListQueryKey({
      adminBrand: '',
      adminOrg: '',
      brandId,
      currentPage,
      filterSearch: search || '',
      filterSort,
      filterStatus: normalizedStatus || '',
      organizationId,
      platformFilter,
      publicationState,
      scope,
      status: normalizedStatus,
    }),
  });

  return (
    <ServerQueryHydrationBoundary>
      <PublishingPostsList
        platform={normalizedPlatform}
        publicationState={publicationState ?? null}
        scope={scope}
        status={normalizedStatus}
      />
    </ServerQueryHydrationBoundary>
  );
}
