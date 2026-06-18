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
  const scope =
    normalizedStatus === 'public' ? PageScope.ANALYTICS : PageScope.PUBLISHER;
  const normalizedPlatform = normalizePostsPlatform(platform);
  const initialData = await loadPostsPageData({
    currentPage: Number(page) || 1,
    platformFilter:
      normalizedPlatform !== 'all' ? normalizedPlatform : undefined,
    scope,
    search,
    sort,
    status: normalizedStatus,
  });

  return (
    <PostsList
      initialPostPresets={initialData.postPresets}
      initialPosts={initialData.posts}
      platform={normalizedPlatform}
      scope={scope}
      status={normalizedStatus}
    />
  );
}
