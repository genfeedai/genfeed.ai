import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AdminFlagsPage from '@protected/flags/admin-flags-page';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Flags');

export default function AdminFlagsRoutePage() {
  return (
    <Suspense fallback={null}>
      <AdminFlagsPage />
    </Suspense>
  );
}
