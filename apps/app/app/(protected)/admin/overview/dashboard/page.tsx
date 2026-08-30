import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Overview');
const OverviewPageContent = dynamic(
  () => import('@protected/overview/dashboard/overview-page'),
);

export default function OverviewPage() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <OverviewPageContent />
    </Suspense>
  );
}
