import VoicesPage from '@admin/(protected)/darkroom/voices/voices-page';
import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Darkroom Voices');

export default function DarkroomVoicesPage() {
  // Darkroom voices is the superadmin TTS/testing workflow.
  // It is intentionally separate from /admin/library/voices, which manages
  // the DB-backed shared voice catalog and curation toggles.
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <VoicesPage />
    </Suspense>
  );
}
