import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import EconomicsRevenueReport from '@protected/economics/revenue/revenue-report';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Revenue');

export default function EconomicsRevenuePage() {
  return (
    <Suspense fallback={null}>
      <EconomicsRevenueReport />
    </Suspense>
  );
}
