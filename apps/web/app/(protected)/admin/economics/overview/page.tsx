import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import EconomicsOverviewReport from '@protected/economics/overview/overview-report';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Economics');

export default function EconomicsOverviewPage() {
  return (
    <Suspense fallback={null}>
      <EconomicsOverviewReport />
    </Suspense>
  );
}
