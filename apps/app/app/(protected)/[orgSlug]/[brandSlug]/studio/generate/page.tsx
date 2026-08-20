'use client';

import StudioGenerateWorkspace from '@pages/studio/generate/StudioGenerateWorkspace';
import FeatureGate from '@ui/guards/feature/FeatureGate';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export default function StudioGeneratePage() {
  return (
    <FeatureGate flagKey="studio">
      <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
        <StudioGenerateWorkspace />
      </Suspense>
    </FeatureGate>
  );
}
