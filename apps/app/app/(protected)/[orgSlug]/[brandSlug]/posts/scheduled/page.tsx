import { APP_ROUTES, createBrandAppRoute } from '@genfeedai/constants';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { redirect } from 'next/navigation';
import type { PostsListSearchParams } from '../posts-list-page';

export const generateMetadata = createPageMetadata('Scheduled Posts');

export default async function ScheduledPostsPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandSlug: string; orgSlug: string }>;
  searchParams: PostsListSearchParams;
}) {
  const [{ brandSlug, orgSlug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
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
      queryString
        ? `${APP_ROUTES.POSTS.ROOT}?${queryString}`
        : APP_ROUTES.POSTS.ROOT,
    ),
  );
}
