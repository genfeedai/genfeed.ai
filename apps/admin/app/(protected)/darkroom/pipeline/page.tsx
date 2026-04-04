import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Darkroom Pipeline');
const PipelinePage = dynamic(
  () => import('@admin/(protected)/darkroom/pipeline/pipeline-page'),
);

export default function DarkroomPipelinePage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <PipelinePage />
    </Suspense>
  );
}
