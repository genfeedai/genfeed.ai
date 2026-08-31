import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import InfrastructurePage from '@protected/fleet/infrastructure/infrastructure-page';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Fleet Infrastructure');

export default function FleetInfrastructurePage() {
  return (
    <Suspense fallback={null}>
      <InfrastructurePage />
    </Suspense>
  );
}
