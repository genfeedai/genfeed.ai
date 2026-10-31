import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import AdminTrainingsPage from './admin-trainings-page';

export const generateMetadata = createPageMetadata('Admin: Model Training');

export default function TrainingsPage() {
  return (
    <Suspense fallback={null}>
      <AdminTrainingsPage />
    </Suspense>
  );
}
