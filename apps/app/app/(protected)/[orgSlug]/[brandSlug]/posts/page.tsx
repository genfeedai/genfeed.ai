import { loadPostsPageData } from '@app-server/posts-page-data.server';
import { PageScope } from '@genfeedai/enums';
import {
  normalizePostsPlatform,
  normalizePublisherPostsStatus,
} from '@helpers/content/posts.helper';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PostsList from '@pages/posts/list/posts-list';
import type { PostsListPageProps } from '@props/pages/page.props';

export const generateMetadata = createPageMetadata('Posts');

export default async function PostsPage({ searchParams }: PostsListPageProps) {
  const { page, platform, search, sort, status } = (await searchParams) as {
    page?: string;
    platform?: string;
    search?: string;
    sort?: string;
    status?: string;
  };
  const normalizedStatus = normalizePublisherPostsStatus(status);
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
