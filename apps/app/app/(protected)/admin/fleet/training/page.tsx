import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import TrainingPage from '@protected/fleet/training/training-page';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Fleet Training');

export default function FleetTrainingPage() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <TrainingPage />
    </Suspense>
  );
}
