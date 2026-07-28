import { APP_ROUTES, createBrandAppRoute } from '@genfeedai/constants';
import { PostStatus } from '@genfeedai/enums';
import { normalizePublisherPostsStatus } from '@helpers/content/posts.helper';
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

  // Collapse legacy status links into the two publishing-state destinations:
  // live posts use /posts/published; every pre-publication state uses /posts.
  const legacyStatus = normalizePublisherPostsStatus(
    resolvedSearchParams.status,
  );
  const statusPath =
    legacyStatus === PostStatus.PUBLIC
      ? APP_ROUTES.POSTS.PUBLISHED
      : APP_ROUTES.POSTS.ROOT;
  if (resolvedSearchParams.status) {
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
