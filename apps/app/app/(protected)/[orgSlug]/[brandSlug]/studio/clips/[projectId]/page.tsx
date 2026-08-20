'use client';

import FeatureGate from '@ui/guards/feature/FeatureGate';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { useParams } from 'next/navigation';
import { Suspense } from 'react';

import ClipsWorkspace from '../ClipsWorkspace';

export default function StudioClipProjectPage() {
  const params = useParams<{ projectId: string }>();

  return (
    <FeatureGate flagKey="studio">
      <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
        <ClipsWorkspace projectId={params.projectId} />
      </Suspense>
    </FeatureGate>
  );
}
