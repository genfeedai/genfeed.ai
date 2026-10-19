import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import UnitEconomicsReport from '@protected/economics/organizations/unit-economics-report';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Unit Economics');

export default function UnitEconomicsPage() {
  return (
    <Suspense fallback={null}>
      <UnitEconomicsReport />
    </Suspense>
  );
}
