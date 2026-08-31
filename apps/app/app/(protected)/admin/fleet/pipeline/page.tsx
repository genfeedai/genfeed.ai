import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Fleet Pipeline');
const PipelinePage = dynamic(
  () => import('@protected/fleet/pipeline/pipeline-page'),
);

export default function FleetPipelinePage() {
  return (
    <Suspense fallback={null}>
      <PipelinePage />
    </Suspense>
  );
}
