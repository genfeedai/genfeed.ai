import VoicesLibraryPage from '@admin/(protected)/library/voices/voices-library-page';
import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Voice Library');

export default function AdminLibraryVoicesPage() {
  // Library voices is the superadmin DB-backed catalog manager.
  // It is intentionally separate from /admin/darkroom/voices, which stays
  // dedicated to experimental/local TTS generation workflows.
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <VoicesLibraryPage />
    </Suspense>
  );
}
