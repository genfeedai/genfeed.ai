'use client';

import StudioGenerateWorkspace from '@pages/studio/generate/StudioGenerateWorkspace';
import FeatureGate from '@ui/guards/feature/FeatureGate';
import { Suspense } from 'react';

export default function StudioGeneratePage() {
  return (
    <FeatureGate flagKey="studio">
      <Suspense fallback={null}>
        <StudioGenerateWorkspace />
      </Suspense>
    </FeatureGate>
  );
}
