import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import StudioGenerateWorkspace from '@pages/studio/generate/StudioGenerateWorkspace';
import FeatureGate from '@ui/guards/feature/FeatureGate';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Generate');

export default function StudioGeneratePage() {
  return (
    <FeatureGate flagKey="studio">
      <Suspense fallback={null}>
        <StudioGenerateWorkspace />
      </Suspense>
    </FeatureGate>
  );
}
