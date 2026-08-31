import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import AdminTrainingsPage from './admin-trainings-page';

export const generateMetadata = createPageMetadata('Admin: Model Training');

export default function TrainingsPage() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <AdminTrainingsPage />
    </Suspense>
  );
}
