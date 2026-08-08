import { APP_ROUTES, createBrandAppRoute } from '@genfeedai/constants';
import { PostStatus } from '@genfeedai/enums';
import { normalizePublisherPostsStatus } from '@helpers/content/posts.helper';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { redirect } from 'next/navigation';
import {
  type PostsListSearchParams,
  renderPostsListPage,
} from '../publish-list-page';

export const generateMetadata = createPageMetadata('Publish Overview');

/**
 * Canonical Publish home — posts list. Bare `/publish` permanently redirects
 * here (page + next.config), matching Workspace/Discover/Library overview.
 */
export default async function PublishOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; brandSlug: string }>;
  searchParams: PostsListSearchParams;
}) {
  const resolvedSearchParams = await searchParams;

  // Collapse legacy status links into the three publishing destinations:
  // failed and live posts have dedicated views; other pre-publication states use overview.
  const legacyStatus = normalizePublisherPostsStatus(
    resolvedSearchParams.status,
  );
  const statusPath =
    legacyStatus === PostStatus.FAILED
      ? APP_ROUTES.PUBLISH.FAILED
      : legacyStatus === PostStatus.PUBLIC
        ? APP_ROUTES.PUBLISH.PUBLISHED
        : APP_ROUTES.PUBLISH.OVERVIEW;
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
