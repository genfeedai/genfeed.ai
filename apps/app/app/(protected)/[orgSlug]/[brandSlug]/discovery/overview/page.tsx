import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import DiscoveryDesk from '@/features/trends/desk/discovery-desk';
import type { DiscoveryOverviewPageProps } from '@/features/trends/props/discovery-desk.props';

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
