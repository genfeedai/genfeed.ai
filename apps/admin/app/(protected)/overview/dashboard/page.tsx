import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Overview');
const OverviewPageContent = dynamic(
  () => import('@protected/overview/dashboard/overview-page'),
);

export default function OverviewPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <OverviewPageContent />
    </Suspense>
  );
}
