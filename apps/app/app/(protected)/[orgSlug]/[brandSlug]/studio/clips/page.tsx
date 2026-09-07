import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import FeatureGate from '@ui/guards/feature/FeatureGate';
import { Suspense } from 'react';

import ClipsWorkspace from './ClipsWorkspace';

export const generateMetadata = createPageMetadata('Clips');

export default function StudioClipsPage() {
  return (
    <FeatureGate flagKey="studio">
      <Suspense fallback={null}>
        <ClipsWorkspace />
      </Suspense>
    </FeatureGate>
  );
}
