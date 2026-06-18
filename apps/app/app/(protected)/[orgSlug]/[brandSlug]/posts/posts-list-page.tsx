import { loadPostsPageData } from '@app-server/posts-page-data.server';
import { PageScope } from '@genfeedai/enums';
import {
  normalizePostsPlatform,
  normalizePublisherPostsStatus,
  type PublisherPostsStatus,
} from '@helpers/content/posts.helper';
import PostsList from '@pages/posts/list/posts-list';

export type PostsListSearchParams = Promise<{
  page?: string;
  platform?: string;
  search?: string;
  sort?: string;
  status?: string;
}>;

export async function renderPostsListPage({
  searchParams,
  statusOverride,
}: {
  searchParams: PostsListSearchParams;
  statusOverride?: PublisherPostsStatus;
}) {
  const { page, platform, search, sort, status } = await searchParams;
  const normalizedStatus =
    statusOverride ?? normalizePublisherPostsStatus(status);
  const parsedPage = Math.floor(Number.parseInt(page ?? '1', 10));
  const currentPage = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1;
  const normalizedPlatform = normalizePostsPlatform(platform);
  const initialData = await loadPostsPageData({
    currentPage,
    platformFilter:
      normalizedPlatform !== 'all' ? normalizedPlatform : undefined,
    scope: PageScope.PUBLISHER,
    search,
    sort,
    status: normalizedStatus,
  });

  return (
    <PostsList
      initialPostPresets={initialData.postPresets}
      initialPosts={initialData.posts}
      platform={normalizedPlatform}
      scope={PageScope.PUBLISHER}
      status={normalizedStatus}
    />
  );
}
