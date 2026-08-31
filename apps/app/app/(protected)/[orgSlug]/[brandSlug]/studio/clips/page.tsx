'use client';

import FeatureGate from '@ui/guards/feature/FeatureGate';
import { Suspense } from 'react';

import ClipsWorkspace from './ClipsWorkspace';

export default function StudioClipsPage() {
  return (
    <FeatureGate flagKey="studio">
      <Suspense fallback={null}>
        <ClipsWorkspace />
      </Suspense>
    </FeatureGate>
  );
}
