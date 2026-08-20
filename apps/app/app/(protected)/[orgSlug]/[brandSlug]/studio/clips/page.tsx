'use client';

import FeatureGate from '@ui/guards/feature/FeatureGate';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

import ClipsWorkspace from './ClipsWorkspace';

export default function StudioClipsPage() {
  return (
    <FeatureGate flagKey="studio">
      <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
        <ClipsWorkspace />
      </Suspense>
    </FeatureGate>
  );
}
