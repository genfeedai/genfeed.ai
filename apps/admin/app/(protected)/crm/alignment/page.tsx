import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AlignmentPage from '@protected/crm/alignment/alignment-page';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('CRM Alignment');

export default function Page() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <AlignmentPage />
    </Suspense>
  );
}
