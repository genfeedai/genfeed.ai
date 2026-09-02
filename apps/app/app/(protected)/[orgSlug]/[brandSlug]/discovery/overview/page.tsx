import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import DiscoveryDesk from '@pages/trends/desk/discovery-desk';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Discovery');

export default function DiscoveryOverviewPage() {
  return (
    <Suspense fallback={null}>
      <DiscoveryDesk />
    </Suspense>
  );
}
