import { APP_ROUTES, createBrandAppRoute } from '@genfeedai/constants';
import { getPublisherPostsStatusPath } from '@helpers/content/posts.helper';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { redirect } from 'next/navigation';
import {
  type PostsListSearchParams,
  renderPostsListPage,
} from './posts-list-page';

export const generateMetadata = createPageMetadata('Posts');

export default async function PostsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; brandSlug: string }>;
  searchParams: PostsListSearchParams;
}) {
  const resolvedSearchParams = await searchParams;

  // Status lives in the path (/posts/scheduled, /posts/published), not the
  // query. Redirect legacy `?status=` links to their canonical nested route,
  // preserving the remaining filters. Drafts (the default) stay on /posts.
  const statusPath = getPublisherPostsStatusPath(resolvedSearchParams.status);
  if (statusPath !== APP_ROUTES.POSTS.ROOT) {
    const { orgSlug, brandSlug } = await params;
    const preservedFilters = new URLSearchParams();
    for (const key of ['platform', 'search', 'sort', 'page'] as const) {
      const value = resolvedSearchParams[key];
      if (value) {
        preservedFilters.set(key, value);
      }
    }
    const queryString = preservedFilters.toString();
    redirect(
      createBrandAppRoute(
        orgSlug,
        brandSlug,
        queryString ? `${statusPath}?${queryString}` : statusPath,
      ),
    );
  }

  return renderPostsListPage({ searchParams });
}
