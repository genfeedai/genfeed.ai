import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import DiscoveryDesk from '@pages/trends/desk/discovery-desk';
import type { DiscoveryOverviewPageProps } from '@props/trends/discovery-desk.props';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Discovery');

export default async function DiscoveryOverviewPage({
  params,
  searchParams,
}: DiscoveryOverviewPageProps) {
  const [{ orgSlug, brandSlug }, search] = await Promise.all([
    params,
    searchParams,
  ]);
  if (search.source === 'following')
    redirect(`/${orgSlug}/${brandSlug ?? '~'}/discovery/following`);
  return (
    <Suspense fallback={null}>
      <DiscoveryDesk />
    </Suspense>
  );
}
