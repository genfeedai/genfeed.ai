import LegacyFollowingRedirect from '@app/(protected)/[orgSlug]/[brandSlug]/discovery/overview/legacy-following-redirect';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import DiscoveryDesk from '@/features/trends/desk/discovery-desk';
import type { DiscoveryOverviewPageProps } from '@/features/trends/props/discovery-desk.props';

export const generateMetadata = createPageMetadata('Discovery');

/**
 * Reads no request data itself, so the desk is part of the prerendered route
 * shell and a click on the Discovery rail app paints at once. Only the
 * legacy-query redirect reads the URL, inside its own Suspense boundary.
 */
export default function DiscoveryOverviewPage({
  params,
  searchParams,
}: DiscoveryOverviewPageProps) {
  return (
    <>
      <Suspense fallback={null}>
        <LegacyFollowingRedirect params={params} searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={null}>
        <DiscoveryDesk />
      </Suspense>
    </>
  );
}
