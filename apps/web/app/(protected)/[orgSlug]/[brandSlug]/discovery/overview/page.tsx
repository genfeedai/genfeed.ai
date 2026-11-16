import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import DiscoveryDesk from '@/features/trends/desk/discovery-desk';

export const generateMetadata = createPageMetadata('Discovery');

/**
 * Reads no request data itself, so the desk is part of the prerendered route
 * shell and a click on the Discovery rail app paints at once.
 */
export default function DiscoveryOverviewPage() {
  return (
    <Suspense fallback={null}>
      <DiscoveryDesk />
    </Suspense>
  );
}
