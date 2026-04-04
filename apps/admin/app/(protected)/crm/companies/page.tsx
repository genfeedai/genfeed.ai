import CompaniesList from '@admin/(protected)/crm/companies/companies-list';
import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('CRM Companies');

export default function Page() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <CompaniesList />
    </Suspense>
  );
}
