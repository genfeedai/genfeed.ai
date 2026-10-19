import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import EconomicsCostsReport from '@protected/economics/costs/costs-report';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Costs');

export default function EconomicsCostsPage() {
  return (
    <Suspense fallback={null}>
      <EconomicsCostsReport />
    </Suspense>
  );
}
