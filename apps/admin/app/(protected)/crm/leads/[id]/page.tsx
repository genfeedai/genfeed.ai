import LeadDetail from '@admin/(protected)/crm/leads/[id]/lead-detail';
import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Lead Detail');

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <LeadDetail id={id} />
    </Suspense>
  );
}
