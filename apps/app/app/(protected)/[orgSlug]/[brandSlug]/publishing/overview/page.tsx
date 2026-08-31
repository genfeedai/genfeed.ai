import { createBrandAppRoute } from '@genfeedai/constants';
import { getPublishingPostsStatusPath } from '@helpers/content/posts.helper';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import type { PostsListSearchParams } from '../publishing-list-page';
import PublishingOverviewPage from './PublishingOverviewPage';

export const generateMetadata = createPageMetadata('Publishing Overview');

/**
 * Publishing home — module dashboard (pulse + launch cards).
 * Draft/post libraries live on Scheduled + Published; calendar on Calendar.
 * Legacy `?status=` list filters still redirect to the right list surface.
 */
export default async function PublishingOverviewRoute({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; brandSlug: string }>;
  searchParams: PostsListSearchParams;
}) {
  const resolvedSearchParams = await searchParams;

  if (resolvedSearchParams.status) {
    const statusPath = getPublishingPostsStatusPath(
      resolvedSearchParams.status,
    );
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

  return (
    <Suspense fallback={null}>
      <PublishingOverviewPage />
    </Suspense>
  );
}
