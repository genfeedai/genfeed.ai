import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import TrainingPage from '@protected/darkroom/training/training-page';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Darkroom Training');

export default function DarkroomTrainingPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <TrainingPage />
    </Suspense>
  );
}
