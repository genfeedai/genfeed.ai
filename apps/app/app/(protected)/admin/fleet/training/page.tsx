import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import TrainingPage from '@protected/fleet/training/training-page';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Fleet Training');

export default function FleetTrainingPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <TrainingPage />
    </Suspense>
  );
}
