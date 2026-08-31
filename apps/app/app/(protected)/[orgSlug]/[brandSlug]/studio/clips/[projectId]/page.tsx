'use client';

import FeatureGate from '@ui/guards/feature/FeatureGate';
import { useParams } from 'next/navigation';
import { Suspense } from 'react';

import ClipsWorkspace from '../ClipsWorkspace';

export default function StudioClipProjectPage() {
  const params = useParams<{ projectId: string }>();

  return (
    <FeatureGate flagKey="studio">
      <Suspense fallback={null}>
        <ClipsWorkspace projectId={params.projectId} />
      </Suspense>
    </FeatureGate>
  );
}
