import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AdminFlagsPage from '@protected/flags/admin-flags-page';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Feature flags');

export default function AdminFeaturesFlagsRoutePage() {
  return (
    <Suspense fallback={null}>
      <AdminFlagsPage kind="features" />
    </Suspense>
  );
}
