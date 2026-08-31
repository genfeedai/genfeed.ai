'use client';

import FeatureGate from '@ui/guards/feature/FeatureGate';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import ClipsWorkspace from './ClipsWorkspace';

export default function StudioClipsPage() {
  return (
    <FeatureGate flagKey="studio">
      <Suspense fallback={<PageLoadingState />}>
        <ClipsWorkspace />
      </Suspense>
    </FeatureGate>
  );
}
