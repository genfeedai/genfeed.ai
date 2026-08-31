'use client';

import FeatureGate from '@ui/guards/feature/FeatureGate';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { useParams } from 'next/navigation';
import { Suspense } from 'react';
import ClipsWorkspace from '../ClipsWorkspace';

export default function StudioClipProjectPage() {
  const params = useParams<{ projectId: string }>();

  return (
    <FeatureGate flagKey="studio">
      <Suspense fallback={<PageLoadingState />}>
        <ClipsWorkspace projectId={params.projectId} />
      </Suspense>
    </FeatureGate>
  );
}
