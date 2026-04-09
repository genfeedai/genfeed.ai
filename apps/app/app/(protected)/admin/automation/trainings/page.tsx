import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { PageScope } from '@genfeedai/enums';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import TrainingsList from '@pages/trainings/list/trainings-list';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Admin: Model Training');

export default function TrainingsPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <TrainingsList scope={PageScope.SUPERADMIN} />
    </Suspense>
  );
}
