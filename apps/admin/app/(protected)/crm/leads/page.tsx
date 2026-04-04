import CrmLeadsPage from '@admin/(protected)/crm/leads/crm-leads-page';
import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('CRM Leads');

export default function Page() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <CrmLeadsPage />
    </Suspense>
  );
}
