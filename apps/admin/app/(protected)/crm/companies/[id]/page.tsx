import CompanyDetail from '@admin/(protected)/crm/companies/[id]/company-detail';
import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Company Detail');

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <CompanyDetail id={id} />
    </Suspense>
  );
}
