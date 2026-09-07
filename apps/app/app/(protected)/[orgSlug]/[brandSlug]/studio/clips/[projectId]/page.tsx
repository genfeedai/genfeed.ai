import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import FeatureGate from '@ui/guards/feature/FeatureGate';
import { Suspense } from 'react';

import ClipsWorkspace from '../ClipsWorkspace';

export const generateMetadata = createPageMetadata('Clips');

export default async function StudioClipProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return (
    <FeatureGate flagKey="studio">
      <Suspense fallback={null}>
        <ClipsWorkspace projectId={projectId} />
      </Suspense>
    </FeatureGate>
  );
}
