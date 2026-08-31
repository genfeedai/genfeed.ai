import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import VoicesLibraryPage from '@protected/library/voices/voices-library-page';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Voice Library');

export default function AdminLibraryVoicesPage() {
  // Library voices is the superadmin DB-backed catalog manager.
  // It is intentionally separate from /admin/fleet/voices, which stays
  // dedicated to experimental/local TTS generation workflows.
  return (
    <Suspense fallback={<PageLoadingState />}>
      <VoicesLibraryPage />
    </Suspense>
  );
}
