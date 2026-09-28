import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AdminFlagsPage from '@protected/flags/admin-flags-page';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Module flags');

export default function AdminModulesFlagsRoutePage() {
  return (
    <Suspense fallback={null}>
      <AdminFlagsPage kind="modules" />
    </Suspense>
  );
}
